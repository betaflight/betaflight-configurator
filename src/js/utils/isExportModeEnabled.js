import $ from 'jquery';

export function isExpertModeEnabled() {
    return $('input[name="expertModeCheckbox"]').is(':checked');
}
