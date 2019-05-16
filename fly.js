const dgram = require('dgram');
const wait = require('waait');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const throttle = require('lodash/throttle');
const commandDelays = require('./commandDelays');
const express = require('express');
const fs = require('fs');
const fr = require('face-recognition')
const base64ToImage = require('base64-to-image');
const path = require('path');
var tt = 0;

const PORT = 8889;
const HOST = '192.168.10.1';
const drone = dgram.createSocket('udp4');
drone.bind(PORT);

function parseState(state) {
  return state
    .split(';')
    .map(x => x.split(':'))
    .reduce((data, [key, value]) => {
      data[key] = value;
      return data;
    }, {});
}

const droneState = dgram.createSocket('udp4');
droneState.bind(8890);

drone.on('message', message => {
  console.log(`🤖 : ${message}`);
  io.sockets.emit('status', message.toString());
});

function handleError(err) {
  if (err) {
    console.log('ERROR');
    console.log(err);
  }
}

const commands = ['command', 'streamon','battery?'];

//send command to drone, open command, video stream, ask battery
drone.send('command', 0, 'command'.length, PORT, HOST, handleError);
drone.send('streamon', 0, 'streamon'.length, PORT, HOST, handleError);
drone.send('battery?', 0, 'battery?'.length, PORT, HOST, handleError);

io.on('connection', socket => {
  console.log('a user connected');
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });

  socket.on('chat message', function(msg){
    console.log('message: ' + msg);
  });
  
  socket.on('command', command => {
    console.log('command Sent from browser');
    console.log(command);
    drone.send(command, 0, command.length, PORT, HOST, handleError);
  });

  socket.emit('status', 'CONNECTED node server');
});

droneState.on(
  'message',
  throttle(state => {
    const formattedState = parseState(state.toString());
    io.sockets.emit('dronestate', formattedState);
  }, 100)
);

app.use('/assets', express.static('assets'));

app.get('/', function(req, res){
  //res.send('<h1>Hello world</h1>');
  res.sendFile(__dirname + '/index.html');
});

(function() {
  var childProcess = require("child_process");
  var oldSpawn = childProcess.spawn;
  function mySpawn() {
      console.log('spawn called');
      console.log(arguments);
      var result = oldSpawn.apply(this, arguments);
      return result;
  }
  childProcess.spawn = mySpawn;
})();

// start node server
var streamIP = '192.168.10.1';
var streamPort = '11111';

// get stream and send to canvas
// way for linux
var ffmpeg = require('child_process').spawn("ffmpeg", [
  "-re", 
  "-y", 
  "-i", "udp://"+streamIP+":"+streamPort, 
  "-s", "360x360",
  "-preset", "ultrafast", 
  "-f", "mjpeg", "pipe:1"
  ]);

  // var ffmpeg = require('child_process').spawn("ffmpeg", [
  //   "-i", 
  //   "udp://"+streamIP+":"+streamPort, 
  //   "-s", "1280x720",
  //   "-acodec", "aac",
  //   "-vcodec", "h264",
  //   "-movflags", "frag_keyframe+empty_moov",
  //   "-f", "mp4",
  //   "pipe:1"
  // ]);  


ffmpeg.on('error', function (err) {
  throw err;
});

ffmpeg.on('close', function (code) {
  console.log('ffmpeg exited with code ' + code);
});

ffmpeg.stderr.on('data', function (data) {
 // console.log('stderr: ' + data);
});

ffmpeg.stdout.on('data', function (data) {
  //var frame = new Buffer(data).toString('base64');
  var frame = new Buffer.from(data).toString('base64');
  io.sockets.emit('canvas',frame);
  tt++;
  //console.log(tt + ' : ' + tt%200)
  var date = new Date();
  var hours = date.getHours();
  var minutes = "0" + date.getMinutes();
  var seconds = "0" + date.getSeconds();
  var formattedTime = hours + '-' + minutes.substr(-2) + '-' + seconds.substr(-2);

  if(tt%200 == 0){
    let buff = new Buffer.from(data, 'base64');
    //console.log(buff)
    var imgpath = path.join(__dirname,`/assets/img/out_${formattedTime}.jpg`)
    fs.writeFile(imgpath, buff, function(error){
      if(error){
         console.log(error);
      }
      
      fs.exists(imgpath, function(exists) {
        if (exists) {
          console.log('img created! out_'+formattedTime+'.jpg');
          try{ 
            const image = fr.loadImage(imgpath)
            const detector = fr.FaceDetector()
            const targetSize = 150
            const faceImages = detector.detectFaces(image, targetSize)
            //console.log(faceImages.length)
            if(faceImages.length>0){
              faceImages.forEach((img, i) => fr.saveImage(`assets/face/${formattedTime}.png`, img))
              console.log('get a face=========================');
            }
          } catch(e) {
              console.error('Error caught by catch block:', e);
          }  
        }
      });

    });
    
  }
});

app.get('/videostream', function(req, res){
    res.contentType('video/mp4');
    ffmpeg.stdout.pipe(res);
});

app.get('/video', function(req, res) {
  const path = 'assets/sample.mp4'
  const stat = fs.statSync(path)
  const fileSize = stat.size
  const range = req.headers.range
  console.log('range ==================== ')
  console.log(range)
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] 
      ? parseInt(parts[1], 10)
      : fileSize-1
    const chunksize = (end-start)+1
    const file = fs.createReadStream(path, {start, end})
    console.log('RANGE: ' + start + ' - ' + end + ' = ' + chunksize)
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(200, head)
    fs.createReadStream(path).pipe(res)
  }
});

http.listen(6767, () => {
  console.log('Socket io server up and running on *:6767');
});