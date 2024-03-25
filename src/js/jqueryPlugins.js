import * as jQueryUI from 'jquery-ui/dist/jquery-ui';
import * as textcomplete from 'jquery-textcomplete';
import * as touchSwipe from  'jquery-touchswipe';
import * as select2 from 'select2';
import 'multiple-select/dist/multiple-select-es.js';
import '../../libraries/jquery.nouislider.all.min.js';
import '../../libraries/jquery.flightindicators.js';

// NOTE: This is a workaround for the select2 issue with vite
// without this line, the select2 plugin will not be loaded.
console.log('Loaded in jquery plugins', {
    jQueryUI,
    textcomplete,
    touchSwipe,
    select2,
});
