var child_process = require('child_process'),
		sys = require('sys'), 
		http = require('http'),
		parse = require('url').parse,
		fs = require('fs');
		
var spawn = child_process.spawn;
var exec = child_process.exec;
		

function getDownloadUrl(video_url, resultCallback) {
  exec('ruby youtube_link.rb ' + video_url,
    function (error, stdout, stderr) {
      if (error !== null) {
        console.log('exec error: ' + error);
      }
      
      resultCallback(stdout);
  });
}

function getYoutubeVideo(video_url, responseCallback) {
  getDownloadUrl(video_url, function(downloadUrl) {
    console.log("Got: " + downloadUrl)
    var url = parse(downloadUrl);
    
    var options = {
      host: url.hostname,
      port: url.port,
      path: url.pathname + url.search
    };
    
    var req = http.request(options, function(res) {
      responseCallback(res);
    });
    
    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });
    
    req.end();
    
    //http.get(options, responseCallback).on('error', function(e) {
    //  console.log("Got error: " + e.message);
    //});
  });
}

function spawnFfmpeg(exitCallback) {
  var args = ['-i', 'pipe:0', '-f', 'mp3', '-ac', '2', '-ab', '128k', '-acodec', 'libmp3lame', 
											'pipe:1']
											
	var ffmpeg = spawn('ffmpeg', args);
										
	console.log('Spawning ffmpeg ' + args.join(' '));

	ffmpeg.on('exit', exitCallback);
	
	ffmpeg.stderr.on('data', function (data) {
    console.log('grep stderr: ' + data);
  });
    
  return ffmpeg;
}

http.createServer(function (req, res) {
    yt_url = parse(req.url, true).query['v'];
    if(typeof yt_url == 'undefined') {
      res.end("Specify url in 'v' query param");
      return;
    }
  
    res.writeHead(200, {'Content-Type': 'audio/mpeg'});
    
    var ffmpeg = spawnFfmpeg(
      function (code) { // exit
      	  console.log('child process exited with code ' + code);
      		res.end();
      });
      
    ffmpeg.stdout.pipe(res)
    
    getYoutubeVideo(yt_url, 
      function(res) {
        res.pipe(ffmpeg.stdin)
    });
    
}).listen(8000);