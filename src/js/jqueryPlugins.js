import './jquery';
import 'jquery-ui/dist/jquery-ui';
import 'jquery-textcomplete';
import 'jquery-touchswipe';
import * as select2 from 'select2';
// NOTE: This is a workaround for the select2 issue with vite
// without this line, the select2 plugin will not be loaded.
console.log('loaded in select2', select2);
import 'multiple-select';
import '../../libraries/jquery.nouislider.all.min.js';
import '../../libraries/jquery.flightindicators.js';
