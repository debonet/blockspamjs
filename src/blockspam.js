
// ---------------------------------------------------------------------------
var reEmail = /[@\.]/;
var reLetters = /[A-Za-z]/;
var fvsExcludeNonWords = function(vs){
	return vs.filter(function(s){
		var c = s.length;
		if (c<4){
			return false;
		}
		if (!s.match(reLetters)){
			return false;
		}
		if (s.match(reEmail)){
			return true;
		}
		return c<12;
	});
};


// ---------------------------------------------------------------------------
var fvsPairs = function(vs){
	var vsOut = [];
	vsOut = vsOut.concat(vs);

	for (var n=0, c=vs.length-1; n<c; n++){
		if (vs[n].length<12 && vs[n+1].length<12){
			vsOut.push(vs[n] + "#" + vs[n+1]);
		}
	};
	return vsOut;
};

// ---------------------------------------------------------------------------
var fvsUnique = function(vs){
	var as = {};
	vs.forEach(function(s){
		as[s] = true;
	});

	var vsOut = [];
	for (s in as){
		if (as.hasOwnProperty(s)){
			vsOut.push(s);
		}
	};
	return vsOut;
};


// ---------------------------------------------------------------------------
var fTrackStats = function(vs,bHam,stat){
	var av = stat.av;
	vs.forEach(function(s){
		// 0 = cHam
		// 1 = cSeen
		// 2 = nLastSeen
		if (!(s in av)){
			av[s] = [0,0,0];
		}

		if (bHam){
			av[s][0]++;
		}
		av[s][1]++;
		av[s][2] = stat.nGeneration;
	});
};

// ---------------------------------------------------------------------------
var fPurgeRarities = function(stat, rThreshold){
	var av = stat.av;
	var c=0;
	for (s in av){
		if (av.hasOwnProperty(s)){
			var cAge = stat.nGeneration - av[s][2];
			if (av[s][1] / cAge < rThreshold){
				delete av[s];
			}
			else{
				c++;
			}
		}
	};
	console.log("fields",c);
};




// ---------------------------------------------------------------------------

/*
var fProcessHeader = function(){
var bInHeader = true;
	if (bInHeader){
		var vs = s.split('\n');
		vs.some(function(sLine){
			if (sLine.length===0){
				bInHeader = false;
				return true;
			}

			// process headers here
		});
  }
};
*/



// ---------------------------------------------------------------------------
var fvsProcessMessage = function(s){
	s=s.replace(/>/g,"> ");
	s=s.replace(/</g," <");
	s=s.replace(/[;=,]/g," ");
	var vs=s.split(/[\s]+/);
	vs = fvsExcludeNonWords(vs);
	//	vs = fvsPairs(vs);
	vs = fvsUnique(vs);
	return vs;
};



// ---------------------------------------------------------------------------
var frEvaluate = function(vs,stat){
	var av = stat.av;

	var rT = 0;
	var c = 0;

	vs.forEach(function(s){
		if (s in av){
			rT += (av[s][0] / av[s][1]);
			c++;
		}
	});


	return c ? 1 - (rT/c) : 0.5;
};



// ---------------------------------------------------------------------------
var fsRepeat = function(s,c){
	var sOut = "";
	for (var n=0; n<c; n++){
		sOut += s;
	}
	return sOut;
};

// ---------------------------------------------------------------------------
var fHandleEmailStream = function(stream, bHam, bSpam, stat, fCallback){

	if (bHam && bSpam){
		return fCallback("can't be ham and spam!");
	}

	var sMessage = "";

	// --------------------
	stream.on('readable', function() {
		var s = stream.read();
		if (s === null) {
			return;
		}

		sMessage += s;
	});


	if (bHam || bSpam){
		// --------------------
		stream.on('end', function() {
			fCallback(null,"message added as " + (bHam?"ham":"spam"), sMessage);
			var vs = fvsProcessMessage(sMessage);
			fTrackStats(vs, bHam, stat);
			if ((stat.nGeneration%10) === 0){
				fPurgeRarities(stat, 0.0005);
			}
		});
	}
	else{
		stream.on('end', function() {
			var vs = fvsProcessMessage(sMessage);
			var r = frEvaluate(vs, stat);
			var nScore = Math.floor(r*100);
			var sScoreStar = fsRepeat('*', Math.floor(r*20)+1);
			sMessage = (
				""
					+ "X-BlockSpam-Score: " + nScore + "\n" 
					+ "X-BlockSpam-Stars: " + sScoreStar + "\n" 
					+ sMessage
					+ "\n"
					+ "-----------------------\n"
					+ "BlockSpam-Score: "  + nScore + "\n"
					+ "\n"
			);
			fCallback(null, "score: " + nScore, sMessage);
		});
	}
};


// ---------------------------------------------------------------------------
var fLoadStats = function(sfl, fCallback){
	nsFs.readFile(sfl, function(err,buff){
		var stat;
		try{
			stat = JSON.parse(err?"invalid":buff.toString());
		}
		catch(e){
			stat = {
				nGeneration : -1,
				av : {}
			};
		}

		fCallback(null, stat);
	});
};


// ---------------------------------------------------------------------------
var fWriteStats = function(sfl, stat, fCallback){
	console.log("writing database");
	nsFs.writeFile(sfl, JSON.stringify(stat), fCallback);
};


// ---------------------------------------------------------------------------
var fDaemonMode = function(sflDatabase, nPort){
	console.log("Daemon mode");
	fLoadStats(sflDatabase, function(err, stat){
		nsHttp.createServer(function (req, res) {
			var bHam  = (req.url === "/ham" );
			var bSpam = (req.url === "/spam");
			var bTraining = bHam || bSpam;
			if (bTraining){
				stat.nGeneration++;
			}
			var tm = new Date().getTime();
			fHandleEmailStream(req, bHam, bSpam, stat, function(err,s, sMessage){
				console.log("processed", s, ((new Date().getTime())-tm)/1000);
				res.writeHead(200, {'Content-Type': 'text/plain'});
				res.end(bTraining ? s : sMessage);
				if (bTraining && (stat.nGeneration % 50) === 0){
					fWriteStats(sflDatabase, stat);
				}					
			});
		}).listen(nPort);
	});
};

// ---------------------------------------------------------------------------
var fClientMode = function(
	sflMessage, bHam, bSpam, sflDatabase, sServer, nPort
){
	var sPath = bHam? "/ham" : (bSpam ? "/spam" : "/score");
	var aOptions = {
		hostname : sServer,
		port     : nPort,
		method   : "POST",
		path     : sPath,
	};
	var req=nsHttp.request(aOptions, function(res){
		res.setEncoding('utf8');
		res.on('data', function (s) {
			console.log(s);
		}); 
	});
	req.on('error', function(){
		console.log("COULD NOT OPEN");
		process.exit(1);
	});

	var stream = nsFs.createReadStream(sflMessage);
	stream.pipe(req);
};

// ---------------------------------------------------------------------------
var fStandaloneMode = function(sflMessage, bHam, bSpam, sflDatabase){
	fLoadStats(sflDatabase, function(err, stat){
		var stream = nsFs.createReadStream(sflMessage);
		var bTraining = bHam || bSpam;
		if (bTraining){
			stat.nGeneration++;
		}
		fHandleEmailStream(
			stream, bHam, bSpam, stat, function(err,s, sMessage){
				console.log((bHam || bSpam)?s:sMessage);
				if (bTraining){
					fWriteStats(sflDatabase, stat);
				}
			}
		);
	});
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
var nsFs = require("fs");
var nsHttp = require('http');
var Yargs = require("yargs");

var fMain = function(){
	var yargs = Yargs
		.usage(
			''
				+ 'Filter out spam mail\n'
				+ 'Usage:\n'
				+ '\tSimple mode: $0 [-s|-h] [<email-message>]'
				+ '\tDaemon mode: $0 -d'
				+ '\tClient mode: $0 -c [-s|-h] [<email-message>]'
		)
		.demand(0)

		.boolean('help')
		.describe('help', "Get help")

		.boolean('h')
		.default('h',false)
		.alias('h', 'ham')
		.describe('h', "Train using message as ham")

		.boolean('s')
		.default('s',false)
		.alias('s', 'spam')
		.describe('s', "Train using message as spam")

		.string('d')
		.default('d',false)
		.alias('d', 'daemon')
		.describe('d', "Daemon mode. Launch server. See --port option")

		.string('c')
		.default('c',false)
		.alias('c', 'client')
		.describe('c', "Pass message to daemon for evaluation or training")

		.string('server')
		.default('server',"localhost")
		.describe('server', "Hostname of the daemon")

		.string('p')
		.default('p',"1025")
		.alias('p', 'port')
		.describe('p', "Port used by daemon")
	
		.string('db')
		.default('db',"blockspam.db")
		.alias('db', 'database')
		.describe('db', "Database file")
	
		.check(function(aArg){
			(!aArg["ham"] || !aArg["spam"]) 
				&& (!aArg["client"] || !aArg["daemon"]) 
		});
	
	var aArg = yargs.argv;

	if (aArg["help"]){
		yargs.showHelp();
		process.exit();
	}

	var sflDatabase = aArg["database"];
	var nPort       = aArg["port"]
	var sServer     = aArg["server"];
	var bHam        = aArg["ham"];
	var bSpam       = aArg["spam"];
	var sflMessage  = aArg._[0] || "/dev/stdin";

	// daemon mode
	if (aArg["daemon"]){
		fDaemonMode(sflDatabase, nPort);
	}
	// client mode
	else if (aArg["client"]){
		fClientMode(sflMessage, bHam, bSpam, sflDatabase, sServer, nPort);
	}
	// standalone mode
	else{ 
		fStandaloneMode(sflMessage, bHam, bSpam, sflDatabase);
	}

}

fMain();






