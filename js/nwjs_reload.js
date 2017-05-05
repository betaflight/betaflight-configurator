var gulp = require('gulp');

gulp.task('reload-app', function () {
  if (location) location.reload();
});

gulp.task('css', function () {
  var styles = document.querySelectorAll('link[rel=stylesheet]');

  for (var i = 0; i < styles.length; i++) {
    // reload styles
    var restyled = styles[i].getAttribute('href') + '?v='+Math.random(0,10000);
    styles[i].setAttribute('href', restyled);
  };
});

gulp.watch(['**/*.css'], ['css']);
gulp.watch(['**/*.js', '**/*.html'], ['reload-app']);
