var Xpl = require("xpl-api");
var commander = require('commander');
var OpenKarotz = require('openkarotz');
var os = require('os');
var debug = require('debug')('xpl-karotz');
var Semaphore = require('semaphore');
var UUID = require('uuid');

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

        commander.xplSource = "karotz." + hostName;
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

        function sendPhase(uuid, type, phase) {
          xpl.sendXplStat({
            "command" : type,
            "phase" : phase,
            "uuid" : uuid
          }, "karotz.basic");
        }

        console.log("Xpl bind succeed ");
        xpl.on("xpl:xpl-cmnd", function(message) {
          debug("Receive XPL", message);

          if (message.bodyName !== "karotz.basic") {
            return;
          }

          var body = message.body;

          var uuid = body.uuid || UUID.v4();

          if (body.command == "ears") {
            earsSemaphore.take(function() {
              var left = body.left && parseInt(body.left, 10);
              var right = body.right && parseInt(body.right, 10);

              debug("Karotz ears left=", left, " right=", right);

              sendPhase(uuid, "ears", "begin");

              karotz.ears(left || 0, right || 0, function(error) {
                earsSemaphore.leave();

                sendPhase(uuid, "ears", "end");

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (body.command == "reset-ears") {

            debug("Karotz ears RESET");

            earsSemaphore.take(function() {

              sendPhase(uuid, "ears-reset", "begin");

              karotz.ears_reset(function(error) {

                earsSemaphore.leave();

                sendPhase(uuid, "ears-reset", "end");

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (body.command == "tts") {
            var ttsMessage = body.message || "Le message est mal défini";

            debug("Karotz tts message=", ttsMessage, " voice=", body.voice);

            ttsSemaphore.take(function() {

              sendPhase(uuid, "tts", "begin");

              karotz.tts(ttsMessage, body.voice, false, function(error) {
                ttsSemaphore.leave();

                sendPhase(uuid, "tts", "end");

                debug("Karotz tts returned");

                if (error) {
                  console.error(error);
                }
              });
            });
            return;
          }

          if (body.command == "sound") {
            debug("Karotz sound soundId=", body.soundId, " url=", body.url);

            soundSemaphore.take(function() {
              sendPhase(uuid, "sound", "begin");

              karotz.sound(body.soundId, body.url, function(error) {
                debug("Karotz sound end");
                soundSemaphore.leave();

                sendPhase(uuid, "sound", "end");

                if (error) {
                  console.error(error);
                  return;
                }
              });
            });
          }

          debug("Karotz UNKNOWN COMMAND", body.command);
        });
      });
    });

commander.parse(process.argv);

if (commander.headDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
