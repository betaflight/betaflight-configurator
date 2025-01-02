import FC from "./fc";
import $ from "jquery";

export function update_dataflash_global() {
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
        const gigabytes = megabytes / 1024;
        return `${gigabytes.toFixed(1)}GB`;
    }

    const supportsDataflash = FC.DATAFLASH.supported && FC.DATAFLASH.totalSize > 0 && FC.BLACKBOX.blackboxDevice === 1;
    const supportsDatacard = FC.SDCARD.supported && FC.SDCARD.totalSizeKB > 0 && FC.BLACKBOX.blackboxDevice === 2;

    if (supportsDataflash || supportsDatacard) {
        $(".noflash_global").css({
            display: "none",
        });

        $(".dataflash-contents_global").css({
            display: "block",
        });

        let dataflashProgress;
        let dataflashProgressText;

        if (supportsDataflash) {
            dataflashProgress = 100 - ((FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize) / FC.DATAFLASH.totalSize) * 100;
            dataflashProgressText = `Dataflash: free ${formatFilesize(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize)}`;
        }
        if (supportsDatacard) {
            dataflashProgress = 100 - (FC.SDCARD.freeSizeKB / FC.SDCARD.totalSizeKB) * 100;
            dataflashProgressText = `SD Card: free ${formatFilesize(FC.SDCARD.freeSizeKB * 1024)}`;
        }

        $(".dataflash-progress_global").val(dataflashProgress);
        $(".dataflash-contents_global div").text(dataflashProgressText);
    } else {
        $(".noflash_global").css({
            display: "block",
        });

        $(".dataflash-contents_global").css({
            display: "none",
        });
    }
}
