use serde::{Serialize, Serializer};

#[derive(Debug)]
pub struct Error(pub String);

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl From<tauri::Error> for Error {
    fn from(err: tauri::Error) -> Self {
        Self(err.to_string())
    }
}

#[cfg(target_os = "android")]
impl From<jni::errors::Error> for Error {
    fn from(err: jni::errors::Error) -> Self {
        Self(err.to_string())
    }
}
