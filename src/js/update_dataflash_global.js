import FC from "./fc";

function formatFilesize(bytes) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) {
        return `${Math.round(kilobytes)}kB`;
    }
    const megabytes = kilobytes / 1024;
    if (megabytes < 1024) {
        return `${megabytes.toFixed(1)}MB`;
    }
    return `${(megabytes / 1024).toFixed(1)}GB`;
}

function getDataflashInfo() {
    const supportsDataflash = FC.DATAFLASH.supported && FC.DATAFLASH.totalSize > 0 && FC.BLACKBOX.blackboxDevice === 1;
    const supportsDatacard = FC.SDCARD.supported && FC.SDCARD.totalSizeKB > 0 && FC.BLACKBOX.blackboxDevice === 2;

    if (supportsDataflash) {
        const freeBytes = FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize;
        return {
            progress: 100 - (freeBytes / FC.DATAFLASH.totalSize) * 100,
            text: `Dataflash: free ${formatFilesize(freeBytes)}`,
        };
    }
    if (supportsDatacard) {
        return {
            progress: 100 - (FC.SDCARD.freeSizeKB / FC.SDCARD.totalSizeKB) * 100,
            text: `SD Card: free ${formatFilesize(FC.SDCARD.freeSizeKB * 1024)}`,
        };
    }
    return null;
}

export function update_dataflash_global() {
    const noflash = document.querySelector(".noflash_global");
    const contents = document.querySelector(".dataflash-contents_global");
    const info = getDataflashInfo();

    if (info) {
        noflash?.style.setProperty("display", "none");
        contents?.style.removeProperty("display");

        const progress = document.querySelector(".dataflash-progress_global");
        if (progress) {
            progress.value = info.progress;
        }
        const contentsText = contents?.querySelector("div");
        if (contentsText) {
            contentsText.textContent = info.text;
        }
    } else {
        noflash?.style.setProperty("display", "block");
        contents?.style.setProperty("display", "none");
    }
}
