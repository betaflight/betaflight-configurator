import $ from "jquery";

/**
 * log to GUI
 * @param {string} message message to log to GUI
 */
export function gui_log(message) {
    const commandLog = $("div#log");
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() < 9 ? `0${d.getMonth() + 1}` : d.getMonth() + 1;
    const date = d.getDate() < 10 ? `0${d.getDate()}` : d.getDate();
    const hours = d.getHours() < 10 ? `0${d.getHours()}` : d.getHours();
    const minutes = d.getMinutes() < 10 ? `0${d.getMinutes()}` : d.getMinutes();
    const seconds = d.getSeconds() < 10 ? `0${d.getSeconds()}` : d.getSeconds();
    const time = `${hours}:${minutes}:${seconds}`;

    const formattedDate = `${year}-${month}-${date} @${time}`;
    $("div.wrapper", commandLog).append(
        `<p>${formattedDate} -- ${message}</p>`,
    );
    commandLog.scrollTop($("div.wrapper", commandLog).height());
}
