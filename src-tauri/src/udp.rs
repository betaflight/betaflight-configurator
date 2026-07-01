use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[cfg(not(target_os = "ios"))]
use std::net::UdpSocket;

#[cfg(target_os = "ios")]
use std::ffi::CString;
#[cfg(target_os = "ios")]
use std::os::raw::c_char;
#[cfg(target_os = "ios")]
use std::sync::mpsc::{Receiver, Sender};
#[cfg(target_os = "ios")]
use std::sync::Mutex;

const MAGIC: u32 = 0x4853_4C46;
const REPLY: u8 = 0x80;
const FC_BASE: u32 = 0x0800_0000;
const CONFIG_LO: u32 = 0x0800_4000;
const CONFIG_HI: u32 = 0x0800_8000;

const PF_HELLO: u8 = 1;
const PF_BEGIN: u8 = 2;
const PF_WRITE: u8 = 3;
const PF_END: u8 = 4;
const PF_REBOOT: u8 = 5;

#[derive(Deserialize)]
pub struct Block {
    pub address: u32,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct Progress {
    sent: u32,
    total: u32,
}

#[cfg(target_os = "ios")]
type UdpOpenFn = extern "C" fn(*const c_char, u16) -> i32;
#[cfg(target_os = "ios")]
type UdpSendFn = extern "C" fn(*const u8, usize);
#[cfg(target_os = "ios")]
type UdpCloseFn = extern "C" fn();

#[cfg(target_os = "ios")]
static UDP_FNS: Mutex<Option<(UdpOpenFn, UdpSendFn, UdpCloseFn)>> = Mutex::new(None);
#[cfg(target_os = "ios")]
static UDP_RX_TX: Mutex<Option<Sender<Vec<u8>>>> = Mutex::new(None);

#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn rust_register_udp(open: UdpOpenFn, send: UdpSendFn, close: UdpCloseFn) {
    *UDP_FNS.lock().unwrap() = Some((open, send, close));
}

#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn rust_udp_on_data(bytes: *const u8, len: usize) {
    if bytes.is_null() || len == 0 {
        return;
    }
    let data = unsafe { std::slice::from_raw_parts(bytes, len) }.to_vec();
    if let Some(tx) = UDP_RX_TX.lock().unwrap().as_ref() {
        let _ = tx.send(data);
    }
}

struct Link {
    #[cfg(not(target_os = "ios"))]
    sock: UdpSocket,
    #[cfg(target_os = "ios")]
    rx: Receiver<Vec<u8>>,
}

impl Link {
    #[cfg(not(target_os = "ios"))]
    fn open(ip: &str, port: u16) -> Result<Link, String> {
        let sock = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        sock.connect((ip, port)).map_err(|e| e.to_string())?;
        Ok(Link { sock })
    }

    #[cfg(target_os = "ios")]
    fn open(ip: &str, port: u16) -> Result<Link, String> {
        let fns = *UDP_FNS.lock().unwrap();
        let open_fn = fns
            .map(|(o, _, _)| o)
            .ok_or_else(|| "native UDP transport not registered".to_string())?;
        let (tx, rx) = std::sync::mpsc::channel();
        *UDP_RX_TX.lock().unwrap() = Some(tx);
        let cip = CString::new(ip).map_err(|e| e.to_string())?;
        let code = open_fn(cip.as_ptr(), port);
        if code != 0 {
            *UDP_RX_TX.lock().unwrap() = None;
            return Err(format!("NWConnection UDP open failed, code {code}"));
        }
        Ok(Link { rx })
    }

    #[cfg(not(target_os = "ios"))]
    fn send(&self, pkt: &[u8]) {
        let _ = self.sock.send(pkt);
    }

    #[cfg(target_os = "ios")]
    fn send(&self, pkt: &[u8]) {
        if let Some((_, send, _)) = *UDP_FNS.lock().unwrap() {
            send(pkt.as_ptr(), pkt.len());
        }
    }

    #[cfg(not(target_os = "ios"))]
    fn recv(&self, timeout: Duration) -> Option<Vec<u8>> {
        self.sock.set_read_timeout(Some(timeout.max(Duration::from_millis(1)))).ok()?;
        let mut buf = [0u8; 2048];
        match self.sock.recv(&mut buf) {
            Ok(n) => Some(buf[..n].to_vec()),
            Err(_) => None,
        }
    }

    #[cfg(target_os = "ios")]
    fn recv(&self, timeout: Duration) -> Option<Vec<u8>> {
        self.rx.recv_timeout(timeout).ok()
    }

    #[cfg(not(target_os = "ios"))]
    fn drain(&self) {
        let _ = self.sock.set_nonblocking(true);
        let mut buf = [0u8; 2048];
        while self.sock.recv(&mut buf).is_ok() {}
        let _ = self.sock.set_nonblocking(false);
    }

    #[cfg(target_os = "ios")]
    fn drain(&self) {
        while self.rx.try_recv().is_ok() {}
    }

    #[cfg(not(target_os = "ios"))]
    fn close(self) {}

    #[cfg(target_os = "ios")]
    fn close(self) {
        if let Some((_, _, close)) = *UDP_FNS.lock().unwrap() {
            close();
        }
        *UDP_RX_TX.lock().unwrap() = None;
    }

    fn request(&self, op: u8, args: &[u8], expect: u8, timeout: Duration, retries: u32) -> Result<Vec<u8>, String> {
        let mut pkt = MAGIC.to_le_bytes().to_vec();
        pkt.push(op);
        pkt.extend_from_slice(args);
        for _ in 0..retries {
            self.drain();
            self.send(&pkt);
            let deadline = Instant::now() + timeout;
            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                let Some(reply) = self.recv(remaining) else { break };
                if reply.len() >= 6
                    && u32::from_le_bytes([reply[0], reply[1], reply[2], reply[3]]) == MAGIC
                    && reply[4] == (expect | REPLY)
                {
                    if reply[5] != 0 {
                        return Err(format!("FC rejected {expect:#04x} with error {}", reply[5]));
                    }
                    return Ok(reply);
                }
            }
        }
        Err(format!("no reply to {expect:#04x} after {retries} tries"))
    }
}

fn crc32(buf: &[u8]) -> u32 {
    let mut c: u32 = 0xFFFF_FFFF;
    for &b in buf {
        c ^= b as u32;
        for _ in 0..8 {
            c = (c >> 1) ^ (0xEDB8_8320 & 0u32.wrapping_sub(c & 1));
        }
    }
    c ^ 0xFFFF_FFFF
}

fn run_flash(app: &AppHandle, ip: &str, port: u16, blocks: Vec<Block>) -> Result<(), String> {
    let mut runs: Vec<(u32, Vec<u8>)> = Vec::new();
    let mut stream: Vec<u8> = Vec::new();
    let mut sorted = blocks;
    sorted.retain(|b| !b.data.is_empty() && !(b.address >= CONFIG_LO && b.address < CONFIG_HI));
    sorted.sort_by_key(|b| b.address);
    for b in &sorted {
        if b.address < FC_BASE || b.address % 4 != 0 {
            return Err(format!("block at {:#010x} is not word aligned", b.address));
        }
        let mut d = b.data.clone();
        while d.len() % 4 != 0 {
            d.push(0xFF);
        }
        stream.extend_from_slice(&d);
        runs.push((b.address - FC_BASE, d));
    }
    let total = stream.len() as u32;
    if total == 0 {
        return Err("no programmable data in the firmware".to_string());
    }
    let crc = crc32(&stream);

    let link = Link::open(ip, port)?;

    let hello = link.request(PF_HELLO, &[], PF_HELLO, Duration::from_millis(500), 60)?;
    let max_chunk = if hello.len() >= 20 {
        u16::from_le_bytes([hello[18], hello[19]]) as usize
    } else {
        1024
    }
    .max(4);

    let mut begin = Vec::new();
    begin.extend_from_slice(&total.to_le_bytes());
    begin.extend_from_slice(&crc.to_le_bytes());
    link.request(PF_BEGIN, &begin, PF_BEGIN, Duration::from_secs(3), 10)?;

    let mut sent: u32 = 0;
    for (off, data) in &runs {
        let mut pos = 0usize;
        while pos < data.len() {
            let end = (pos + max_chunk).min(data.len());
            let piece = &data[pos..end];
            let mut args = Vec::with_capacity(6 + piece.len());
            args.extend_from_slice(&(off + pos as u32).to_le_bytes());
            args.extend_from_slice(&(piece.len() as u16).to_le_bytes());
            args.extend_from_slice(piece);
            link.request(PF_WRITE, &args, PF_WRITE, Duration::from_secs(6), 10)?;
            pos = end;
            sent += piece.len() as u32;
            let _ = app.emit("phoneflash-progress", Progress { sent, total });
        }
    }

    let end = link.request(PF_END, &[], PF_END, Duration::from_secs(6), 10)?;
    if end.len() < 10 {
        return Err("short END reply from FC".to_string());
    }
    let fc_crc = u32::from_le_bytes([end[6], end[7], end[8], end[9]]);
    if fc_crc != crc {
        return Err(format!("verify failed: FC crc {fc_crc:#010x} != {crc:#010x}"));
    }

    let _ = link.request(PF_REBOOT, &[], PF_REBOOT, Duration::from_secs(1), 2);
    link.close();
    Ok(())
}

#[tauri::command]
pub fn phoneflash_flash(app: AppHandle, ip: String, port: u16, blocks: Vec<Block>) -> Result<(), String> {
    std::thread::spawn(move || match run_flash(&app, &ip, port, blocks) {
        Ok(()) => {
            let _ = app.emit("phoneflash-done", ());
        }
        Err(e) => {
            let _ = app.emit("phoneflash-error", e);
        }
    });
    Ok(())
}
