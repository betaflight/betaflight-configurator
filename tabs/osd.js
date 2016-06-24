'use strict';

var SYM = SYM || {};

SYM._sym_sizes = {
  VOLT: 1,
  RSSI: 1,
  FLY_M: 1,
  ON_M: 1,
  THR: 2,
  AH_CENTER_LINE: 1,
  AH_CENTER_LINE_RIGHT: 1,
  AH_CENTER: 1,
  AH_BAR9_0: 10,
  AH_DECORATION: 1,
  AH_LEFT: 1,
  AH_RIGHT: 1
};

var FONT = FONT || {};

FONT.initData = function() {
  if (FONT.data) {
    return;
  }
  FONT.data = {
    // default font file name
    loaded_font_file: 'default',
    // array of arry of image bytes ready to upload to fc
    characters_bytes: [],
    // array of array of image bits by character
    characters: [],
    // an array of base64 encoded image strings by character
    character_image_urls: []
  }
};

FONT.constants = {
  SIZES: {
    /** NVM ram size for one font char, actual character bytes **/
    MAX_NVM_FONT_CHAR_SIZE: 54,
    /** NVM ram field size for one font char, last 10 bytes dont matter **/
    MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
    CHAR_HEIGHT: 18,
    CHAR_WIDTH: 12
  },
  COLORS: {
    // black
    0: 'rgba(0, 0, 0, 1)',
    // also the value 3, could yield transparent according to
    // https://www.sparkfun.com/datasheets/BreakoutBoards/MAX7456.pdf
    1: 'rgba(255, 255, 255, 0)',
    // white
    2: 'rgba(255,255,255, 1)'
  }
};

/**
 * Each line is composed of 8 asci 1 or 0, representing 1 bit each for a total of 1 byte per line
 */
FONT.parseMCMFontFile = function(data) {
  var data = data.split("\n");
  // clear local data
  FONT.data.characters.length = 0;
  FONT.data.characters_bytes.length = 0;
  FONT.data.character_image_urls.length = 0;
  // make sure the font file is valid
  if (data.shift().trim() != 'MAX7456') {
    var msg = 'that font file doesnt have the MAX7456 header, giving up';
    console.debug(msg);
    Promise.reject(msg);
  }
  var character_bits = [];
  var character_bytes = [];
  // hexstring is for debugging
  FONT.data.hexstring = [];
  var pushChar = function() {
    FONT.data.characters_bytes.push(character_bytes);
    FONT.data.characters.push(character_bits);
    FONT.draw(FONT.data.characters.length-1);
    //$log.debug('parsed char ', i, ' as ', character);
    character_bits = [];
    character_bytes = [];
  };
  for (var i = 0; i < data.length; i++) {
    var line = data[i];
    // hexstring is for debugging
    FONT.data.hexstring.push('0x' + parseInt(line, 2).toString(16));
    // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
    if (character_bits.length == FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
      pushChar()
    }
    for (var y = 0; y < 8; y = y + 2) {
      var v = parseInt(line.slice(y, y+2), 2);
      character_bits.push(v);
    }
    character_bytes.push(parseInt(line, 2));
  }
  // push the last char
  pushChar();
  return FONT.data.characters;
};


FONT.openFontFile = function($preview) {
  return new Promise(function(resolve) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
      FONT.data.loaded_font_file = fileEntry.name;
      if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          return;
      }
      fileEntry.file(function (file) {
        var reader = new FileReader();
        reader.onloadend = function(e) {
          if (e.total != 0 && e.total == e.loaded) {
            FONT.parseMCMFontFile(e.target.result);
            resolve();
          }
          else {
            console.error('could not load whole font file');
          }
        };
        reader.readAsText(file);
      });
    });
  });
};

/**
 * returns a canvas image with the character on it
 */
var drawCanvas = function(charAddress) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext("2d");

  // TODO: do we want to be able to set pixel size? going to try letting the consumer scale the image.
  var pixelSize = pixelSize || 1;
  var width = pixelSize * FONT.constants.SIZES.CHAR_WIDTH;
  var height = pixelSize * FONT.constants.SIZES.CHAR_HEIGHT;

  canvas.width = width;
  canvas.height = height;

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      if (!(charAddress in FONT.data.characters)) {
        console.log('charAddress', charAddress, ' is not in ', FONT.data.characters.length);
      }
      var v = FONT.data.characters[charAddress][(y*width)+x];
      ctx.fillStyle = FONT.constants.COLORS[v];
      ctx.fillRect(x, y, pixelSize, pixelSize);
    }
  }
  return canvas;
};

FONT.draw = function(charAddress) {
  var cached = FONT.data.character_image_urls[charAddress];
  if (!cached) {
    cached = FONT.data.character_image_urls[charAddress] = drawCanvas(charAddress).toDataURL('image/png');
  }
  return cached;
};

FONT.msp = {
  encode: function(charAddress) {
    return [charAddress].concat(FONT.data.characters_bytes[charAddress].slice(0,FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE));
  }
};

FONT.upload = function($progress) {
  return Promise.mapSeries(FONT.data.characters, function(data, i) {
    $progress.val((i / FONT.data.characters.length) * 100);
    return MSP.promise(MSP_codes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
  })
  .then(function() {
    return MSP.promise(MSP_codes.MSP_SET_REBOOT);
  });
};

FONT.preview = function($el) {
  $el.empty()
  FONT.data.character_image_urls.map(function(url) {
    $el.append('<img src='+url+'></img>');
  });
};

FONT.symbol = function(hexVal) {
  return String.fromCharCode(hexVal);
};

var OSD = OSD || {};

// parsed fc output and output to fc, used by to OSD.msp.encode
OSD.initData = function() {
  OSD.data = {
    video_system: null,
    display_items: [],
    last_positions: {},
    preview: []
  };
};
OSD.initData();

OSD.constants = {
  VIDEO_TYPES: [
    'AUTO',
    'PAL',
    'NTSC'
  ],
  VIDEO_LINES: {
    PAL: 16,
    NTSC: 13
  },
  VIDEO_BUFFER_CHARS: {
    PAL: 480,
    NTSC: 390
  },
  // order matters, so these are going in an array... pry could iterate the example map instead
  DISPLAY_FIELDS: [
    {
      name: 'MAIN_BATT_VOLTAGE',
      default_position: -29,
      positionable: true,
      preview: FONT.symbol(SYM.VOLT) + '16.8'
    },
    {
      name: 'RSSI_VALUE',
      default_position: -59,
      positionable: true,
      preview: FONT.symbol(SYM.RSSI) + '99'
    },
    {
      name: 'TIMER',
      default_position: -39,
      positionable: true,
      preview: FONT.symbol(SYM.ON_M) + ' 11:11'
    },
    {
      name: 'THROTTLE_POS',
      default_position: -9,
      positionable: true,
      preview: FONT.symbol(SYM.THR) + FONT.symbol(SYM.THR1) + '  0'
    },
    {
      name: 'CPU_LOAD',
      default_position: 26,
      positionable: true,
      preview: '15'
    },
    {
      name: 'VTX_CHANNEL',
      default_position: 1,
      positionable: true
    },
    {
      name: 'VOLTAGE_WARNING',
      default_position: -80,
      positionable: true,
      preview: 'LOW VOLTAGE'
    },
    {
      name: 'ARMED',
      default_position: -107,
      positionable: true,
      preview: 'ARMED'
    },
    {
      name: 'DISARMED',
      default_position: -109,
      positionable: true,
      preview: 'DISARMED'
    },
    {
      name: 'ARTIFICIAL_HORIZON',
      default_position: -1,
      positionable: false
    },
    {
      name: 'HORIZON_SIDEBARS',
      default_position: -1,
      positionable: false
    }
  ],
};

OSD.updateDisplaySize = function() {
  var video_type = OSD.constants.VIDEO_TYPES[OSD.data.video_system];
  if (video_type == 'AUTO') {
    video_type = 'PAL';
  }
  // compute the size
  OSD.data.display_size = {
    x: 30,
    y: OSD.constants.VIDEO_LINES[video_type]
  };
};

OSD.msp = {
  encodeOther: function() {
    return [-1, OSD.data.video_system];
  },
  encode: function(display_item) {
    return [
      display_item.index,
      specificByte(display_item.position, 0),
      specificByte(display_item.position, 1)
    ];
  },
  // Currently only parses MSP_MAX_OSD responses, add a switch on payload.code if more codes are handled
  decode: function(payload) {
    var view = payload.data;
    var d = OSD.data;
    d.compiled_in = view.getUint8(0, 1);
    d.video_system = view.getUint8(1, 1);
    d.display_items = [];
    // start at the offset from the other fields
    for (var i = 2; i < view.byteLength; i = i + 2) {
      var v = view.getInt16(i, 1)
      var j = d.display_items.length;
      var c = OSD.constants.DISPLAY_FIELDS[j];
      d.display_items.push({
        name: c.name,
        index: j,
        position: v,
        positionable: c.positionable,
        preview: c.preview
      });
    }
    OSD.updateDisplaySize();
  }
};


TABS.osd = {};
TABS.osd.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'osd') {
        GUI.active_tab = 'osd';
    }

    $('#content').load("./tabs/osd.html", function () {
        // translate to user-selected language
        localize();

        // 2 way binding... sorta
        function updateOsdView() {
          // ask for the OSD config data
          MSP.promise(MSP_codes.MSP_OSD_CONFIG)
          .then(function(info) {
            if (!info.length) {
              $('.tab-osd .unsupported').fadeIn();;
              return;
            }
            $('.tab-osd .supported').fadeIn();;
            OSD.msp.decode(info);
            // video mode
            var $videoTypes = $('.video-types').empty();
            for (var i = 0; i < OSD.constants.VIDEO_TYPES.length; i++) {
              var type = OSD.constants.VIDEO_TYPES[i];
              var $checkbox = $('<label/>').append($('<input name="video_system" type="radio"/>'+type+'</label>')
                .prop('checked', i === OSD.data.video_system)
                .data('type', type)
                .data('type', i)
              );
              $videoTypes.append($checkbox);
            }
            $videoTypes.find(':radio').click(function(e) {
              OSD.data.video_system = $(this).data('type');
              MSP.promise(MSP_codes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
              .then(function() {
                updateOsdView();
              });
            });

            // display fields on/off and position
            var $displayFields = $('.display-fields').empty();
            for (let field of OSD.data.display_items) {
              var checked = (-1 != field.position) ? 'checked' : '';
              //$displayFields.append('<input type="checkbox" data-field-index="'+field.index+'" '+checked+'>'+field.name+'</input>');
              var $field = $('<div class="display-field"/>');
              $field.append(
                $('<input type="checkbox" name="'+field.name+'"></input>')
                .data('field', field)
                .attr('checked', field.position != -1)
                .click(function(e) {
                  var field = $(this).data('field');
                  var $position = $(this).parent().find('.position.'+field.name);
                  if (field.position == -1) {
                    $position.show();
                    field.position = OSD.data.last_positions[field.name]
                  }
                  else {
                    $position.hide();
                    OSD.data.last_positions[field.name] = field.position
                    field.position = -1
                  }
                  MSP.promise(MSP_codes.MSP_SET_OSD_CONFIG, OSD.msp.encode(field))
                  .then(function() {
                    updateOsdView();
                  });
                })
              );
              $field.append('<label for="'+field.name+'">'+field.name+'</label>');
              if (field.positionable && field.position != -1) {
                $field.append(
                  $('<input type="number" class="'+field.name+' position"></input>')
                  .data('field', field)
                  .val(field.position)
                  .change($.debounce(250, function(e) {
                    var field = $(this).data('field');
                    var position = parseInt($(this).val());
                    field.position = position;
                    MSP.promise(MSP_codes.MSP_SET_OSD_CONFIG, OSD.msp.encode(field))
                    .then(function() {
                      updateOsdView();
                    });
                  }))
                );
              }
              $displayFields.append($field);
            }
            // buffer the preview
            OSD.data.preview = [];
            // empty the screen buffer
            var screen_size = OSD.data.display_size.x * OSD.data.display_size.y;
            for(var i = 0; i < screen_size; i++) {
              OSD.data.preview.push(' '.charCodeAt(0));
            }
            // draw all the displayed items
            for(let field of OSD.data.display_items) {
              if (!field.preview || field.position == -1) { continue; }
              var j = (field.position >= 0) ? field.position : field.position + screen_size;
              for(var i = 0; i < field.preview.length; i++) {
                OSD.data.preview[j++] = field.preview.charCodeAt(i);
              }
            }
            // logo
            var x = 160;
            for (var i = 1; i < 5; i++) {
              for (var j = 3; j < 27; j++)
                  OSD.data.preview[i * 30 + j] = x++;
            }
            // render
            var $preview = $('.display-layout .preview').empty();
            var $row = $('<div class="row"/>');
            for(var i = 0; i < screen_size;) {
              var charCode = OSD.data.preview[i];
              $row.append('<img src='+FONT.draw(charCode)+'></img>');
              if (++i % OSD.data.display_size.x == 0) {
                $preview.append($row);
                $row = $('<div class="row"/>');
              }
            }
          });
        };

        $('.display-layout .save').click(function() {
          var self = this;
          MSP.promise(MSP_codes.MSP_EEPROM_WRITE);
          var oldText = $(this).text();
          $(this).html("Saved");
          setTimeout(function () {
              $(self).html(oldText);
          }, 2000);
        });

        // font preview window
        var $preview = $('.font-preview');

        //  init structs once, also clears current font
        FONT.initData();

        var $fontPicker = $('.font-picker button');
        $fontPicker.click(function(e) {
          $fontPicker.removeClass('active');
          $(this).addClass('active');
          $.get('/resources/osd/' + $(this).data('font-file') + '.mcm', function(data) {
            FONT.parseMCMFontFile(data);
            FONT.preview($preview);
            updateOsdView();
          });
        });

        // load the first font when we change tabs
        $fontPicker.first().click();

        // UI Hooks
        $('#fontmanager').jBox('Modal', {
            width: 600,
            height: 290,
            closeButton: 'title',
            animation: false,
            title: 'OSD Font Manager',
            content: $('#fontmanagercontent')
        });

        $('a.load_font_file').click(function() {
          $fontPicker.removeClass('active');
          FONT.openFontFile().then(function() {
            FONT.preview($preview);
            updateOsdView();
          });
        });

        // font upload
        $('a.flash_font').click(function () {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                $('.progressLabel').text('Uploading...');
                FONT.upload($('.progress').val(0)).then(function() {
                    var msg = 'Uploaded all ' + FONT.data.characters.length + ' characters';
                    console.log(msg);
                    $('.progressLabel').text(msg);
                });
            }
        });

        $(document).on('click', 'span.progressLabel a.save_font', function () {
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: 'baseflight', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log('You don\'t have <span style="color: red">write permissions</span> for this file');
                        }
                    });
                });
            });
        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_font').click();
            }
        });

        GUI.content_ready(callback);
    });
};

TABS.osd.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};
