import FC from "./fc";
import $ from 'jquery';

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

        return `${megabytes.toFixed(1)}MB`;
    }

    const supportsDataflash = FC.DATAFLASH.totalSize > 0;

    if (supportsDataflash){
        $(".noflash_global").css({
           display: 'none',
        });

        $(".dataflash-contents_global").css({
           display: 'block',
        });

        $(".dataflash-free_global").css({
           width: `${100-(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize) / FC.DATAFLASH.totalSize * 100}%`,
           display: 'block',
        });
        $(".dataflash-free_global div").text(`Dataflash: free ${formatFilesize(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize)}`);
     } else {
        $(".noflash_global").css({
           display: 'block',
        });

        $(".dataflash-contents_global").css({
           display: 'none',
        });
     }
}
