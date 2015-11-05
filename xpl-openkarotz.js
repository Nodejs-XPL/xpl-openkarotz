var Xpl = require("xpl-api");
var commander = require('commander');
var OpenKarotz = require('openkarotz');
var os = require('os');
var debug = require('debug')('xpl-xmpp');
var Semaphore = require('semaphore');

commander.version(require("./package.json").version);

commander.option("--host <host>", "Karotz host");

Xpl.fillCommander(commander);

commander.command('*').description("Start processing Karotz").action(
    function() {
      console.log("Start");

      var karotz = new OpenKarotz(commander.host);

      var earsSemaphore = Semaphore(1);
      var ledSemaphore = Semaphore(1);
      var ttsSemaphore = Semaphore(1);
      var soundSemaphore = Semaphore(1);

      if (!commander.xplSource) {
        var hostName = os.hostname();
        if (hostName.indexOf('.') > 0) {
          hostName = hostName.substring(0, hostName.indexOf('.'));
        }

        commander.xplSource = "xmpp." + hostName;
      }

      var xpl = new Xpl(commander);

      xpl.on("error", function(error) {
        console.error("XPL error", error);
      });

      xpl.bind(function(error) {
        if (error) {
          console.log("Can not open xpl bridge ", error);
          process.exit(2);
          return;
        }

        console.log("Xpl bind succeed ");
        xpl.on("xpl:xpl-cmnd", function(message) {
          debug("Receive XPL", message);

          var body = message.body;

          if (message.bodyName == "karotz.ears") {
            earsSemaphore.take(function() {
              var left = body.left && parseInt(body.left);
              var right = body.right && parseInt(body.right);

              karotz.ears(left || 0, right || 0, function(error) {
                earsSemaphore.leave();

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (message.bodyName == "karotz.reset-ears") {
            earsSemaphore.take(function() {
              karotz.ears_reset(function(error) {
                earsSemaphore.leave();

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (message.bodyName == "karotz.tts") {
            var ttsMessage = body.message || "Le message est mal défini";

            ttsSemaphore.take(function() {
              karotz.tts(ttsMessage, body.voice, false, function(error) {
                ttsSemaphore.leave();

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (message.bodyName == "karotz.sound") {
            soundSemaphore.take(function() {
              karotz.sound(body.soundId, body.url, false, function(error) {
                soundSemaphore.leave();

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

        });
      });
    });

commander.parse(process.argv);

if (commander.headDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
