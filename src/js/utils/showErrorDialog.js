export function showErrorDialog(message) {
    const dialog = document.querySelector(".dialogError");
    if (!dialog) {
        return;
    }

    const content = document.querySelector(".dialogError-content");
    if (content) {
        content.innerHTML = message;
    }

    const closeBtn = document.querySelector(".dialogError-closebtn");
    if (closeBtn) {
        closeBtn.onclick = () => dialog.close();
    }

    dialog.showModal();
}
