export function isExpertModeEnabled() {
    return document.querySelector('input[name="expertModeCheckbox"]')?.checked ?? false;
}
