// vite goes brrrrr when trying to
// use the jquery the same way as in nwjs
// just using separate files so that everyone
// is happy and we can drop the nw in the end. [TC]
import 'jquery-ui/dist/jquery-ui';
import 'jquery-textcomplete';
import 'jquery-touchswipe';
import select2 from 'select2';
select2(jQuery);
import 'multiple-select';
import '../../libraries/jquery.nouislider.all.min.js';
import '../../libraries/jquery.flightindicators.js';
