var D = console.log;

// ---------------------------------------------------------------------------
var reEmail = /@/;
var reNonLetters = /[^-A-Za-z\.]/;
var fvsExcludeNonWords = function(vs){
	var vsOut = [];

	vs.map(function(s){
		if (s.match("http[s]?://")){
			var s = (s.replace(/^.*:\/\//,'')).replace(/\/.*/,'');
			return vsOut.push(s);
		}

		var c = s.length;
		if (c<4){
			return false;
		}

		if (s.match(reEmail)){
			s= s.replace(/.*</,'').replace(/>.*/);
			return vsOut.push(s);
		}

		if (s.match(reNonLetters)){
			return false;
		}


		if (c<12){
			return vsOut.push(s);
		}
	});
	return vsOut;
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
var fvrForSender = function(aHeader, stat, bCreate){
	var sSender = aHeader["From"] || aHeader["Return-Path"];
	if (sSender && sSender.length){
		sSender = sSender.replace(/^.*</,'').replace(/>.*$/,'');
		sSender = sSender.trim();
		stat.avrSender = stat.avrSender || {};
		if (!(sSender in stat.avrSender)){
			if (bCreate){
				stat.avrSender[sSender] = [0,0];
			}
			else{
				return false;
			}
		}

		return stat.avrSender[sSender];
	}
};

// ---------------------------------------------------------------------------
var fTrackSenderStat = function(aHeader, rScore, stat){
	var vr = fvrForSender(aHeader, stat, rScore < 0.4);
	if (vr){
		vr[0] += 1-rScore;
		vr[1] += rScore;
	}
};

// ---------------------------------------------------------------------------
var fTrackMessageStat = function(vsMessage, bHam, stat){
	var avc = stat.avcBody || {};
	vsMessage.forEach(function(s){
		// 0 = cHam
		// 1 = cSeen
		// 2 = nLastSeen
		if (!(s in avc)){
			avc[s] = [0,0,0];
		}

		if (bHam){
			avc[s][0]++;
		}
		avc[s][1]++;
		avc[s][2] = stat.nGeneration;
	});
}
// ---------------------------------------------------------------------------
var fTrackStats = function(aHeader, vsMessage, bHam, stat){
	fTrackSenderStat(aHeader, bHam?0:1, stat);
	fTrackMessageStat(vsMessage, bHam, stat);
};

// ---------------------------------------------------------------------------
var frEvaluateMessage = function(vsMessage, stat){
	var avc = stat.avcBody;

	var rT = 0;
	var c = 0;

	vsMessage.forEach(function(s){
		if (s in avc){
			rT += (avc[s][0] / avc[s][1]);
			c++;
		}
	});


	return c ? 1 - (rT/c) : 0.5;
};

// ---------------------------------------------------------------------------
var frEvaluateSender = function(aHeader, stat){
	var vr = fvrForSender(aHeader, stat, false);
	if (vr){
		if (vr[0] > 2 || vr[1]){
			return (vr[1]/(vr[0] + vr[1]));
		}
	}
	return false;
};



// ---------------------------------------------------------------------------
var fPurgeRarities = function(stat, rThreshold){
	var avc = stat.avcBody;
	var c=0;
	for (s in avc){
		if (avc.hasOwnProperty(s)){
			var cAge = stat.nGeneration - avc[s][2];
			if (avc[s][1] / cAge < rThreshold){
				delete avc[s];
			}
			else{
				c++;
			}
		}
	};
	console.log("fields",c);
};


// ---------------------------------------------------------------------------
var faHeaderProcess = function(s){
	vs = s.split('\n');
	
	var bInHeader = true;

	var aHeader = {};

	var sVar;
	var sVal="";

	vs.some(function(sLine){
		if (sLine.length===0){
			return true;
		}

		if (sVar){
			var ch0 = sLine.charAt(0);
			if (ch0 === ' ' || ch0 === "\t"){
				sVal = sVal + " " + sLine.trim();
				return;
			}

			aHeader[sVar]=sVal;
			sVar=undefined;
			sVal="";
		}

		var vsLine = sLine.split(':');
		sVar = vsLine[0];
		
		sVal = sLine.substring(sVar.length+1).trim();

	});

	if (sVar){
		aHeader[sVar]=sVal;
	}		
	
	return aHeader;

};



// ---------------------------------------------------------------------------
var fvsMessageProcess = function(s){
	s=s.replace(/>/g,"> ");
	s=s.replace(/</g," <");
	s=s.replace(/[;=,]/g," ");
	var vs=s.split(/[\s"']+/);
	vs = fvsExcludeNonWords(vs);
	//	vs = fvsPairs(vs);
	vs = fvsUnique(vs);
	return vs;
};



// ---------------------------------------------------------------------------
var fEvaluateEmail = function(stream, bGuess, stat, fCallback){

	var sMessage = "";

	// --------------------
	stream.on('readable', function() {
		var s = stream.read();
		if (s === null) {
			return;
		}

		sMessage += s;
	});


	stream.on('end', function() {
		var aHeader   = faHeaderProcess(sMessage);
		var vsMessage = fvsMessageProcess(sMessage);
		var rBody  = null;
		var rSender   = frEvaluateSender(aHeader,stat) 
		
		var bSenderGood = rSender!==false && (rSender > .75 || rSender<.25);

		if (!bSenderGood || bGuess){
			rBody = frEvaluateMessage(vsMessage, stat);
		}

		var rScore = bSenderGood ? rSender : rBody;

		if (bGuess){
			fTrackSenderStat(aHeader, 1-rScore, stat);
		}

		var nScore = Math.floor(rScore * 100);
		var nSender = Math.floor(rSender * 100);
		var nBody = Math.floor(rBody * 100);

		var sScore  = "X-BlockSpam-Score: " + nScore + "\n";
		var sSender = (
			rSender !== false 
				?	"X-BlockSpam-Sender: " + nSender + "\n" 
				: ""
		);

		var sBody = (
			rBody !== null
				?	"X-BlockSpam-Body: " + nBody + "\n" 
				: ""
		);

		sMessage = (sScore + sSender + sBody	+ sMessage);
		fCallback(
			null, 
			"score: " + nScore + "/" + nSender + "/" + nBody, 
			sMessage
		);
	});

};


// ---------------------------------------------------------------------------
var fTrainOnEmail = function(stream, bHam, stat, fCallback){

	var sMessage = "";

	// --------------------
	stream.on('readable', function() {
		var s = stream.read();
		if (s === null) {
			return;
		}

		sMessage += s;
	});


	// --------------------
	stream.on('end', function() {
		var aHeader   = faHeaderProcess(sMessage);
		var vsMessage = fvsMessageProcess(sMessage);

		fTrackStats(aHeader,vsMessage, bHam, stat);
		if ((stat.nGeneration%10) === 0){
			fPurgeRarities(stat, 0.0005);
		}
		fCallback(null,"message added as " + (bHam?"ham":"spam"), sMessage);
	});
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
				avcBody    : {},
				avrSender   : {}
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
var fDaemonMode = function(aOptions){
	var sflDatabase = aOptions["database"];
	var nPort       = aOptions["port"]

	console.log("Daemon mode");
	fLoadStats(sflDatabase, function(err, stat){
		nsHttp.createServer(function (req, res) {
			var bHam   = (req.url === "/ham" );
			var bSpam  = (req.url === "/spam");
			var bGuess = (req.url === "/guess");

			var tm = new Date().getTime();

			var bTraining = bHam || bSpam;
			if (bTraining || bGuess){
				stat.nGeneration++;
			}

			if (bTraining){
				fTrainOnEmail(req, bHam, stat, function(err,s){
					console.log("processed", s, ((new Date().getTime())-tm)/1000);
					res.writeHead(200, {'Content-Type': 'text/plain'});
					res.end(s);
					if (stat.nGeneration % 50 === 0){
						fWriteStats(sflDatabase, stat);
					}					
				});
			}
			else{
				fEvaluateEmail(req, bGuess, stat, function(err,s, sMessage){
					console.log("processed", s, ((new Date().getTime())-tm)/1000);
					res.writeHead(200, {'Content-Type': 'text/plain'});
					res.end( sMessage);
					if (bGuess && (stat.nGeneration % 50) === 0){
						fWriteStats(sflDatabase, stat);
					}					
				});

			}

		}).listen(nPort);
	});
};

// ---------------------------------------------------------------------------
var fClientMode = function(aOptions){
	var nPort       = aOptions["port"]
	var sServer     = aOptions["server"];
	var bHam        = aOptions["ham"];
	var bSpam       = aOptions["spam"];
	var bGuess      = aOptions["guess"];
	var sflMessage  = aOptions["message"];

	var sIndex = "" + bHam + ":" + bSpam + ":" + bGuess;

	var asPath = {
		"true:false:false" : "/ham",
		"false:true:false" : "/spam",
		"false:false:true" : "/guess",
	};

	var sPath = asPath[sIndex] || "/evaluate";

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
		console.log("COULD NOT REACH DAEMON");
		process.exit(1);
	});

	var stream = nsFs.createReadStream(sflMessage);
	stream.pipe(req);
};

// ---------------------------------------------------------------------------
var fStandaloneMode = function(aOptions){
	var sflDatabase = aOptions["database"];
	var bHam        = aOptions["ham"];
	var bSpam       = aOptions["spam"];
	var bGuess      = aOptions["guess"];
	var sflMessage  = aOptions["message"];

	fLoadStats(sflDatabase, function(err, stat){
		var stream = nsFs.createReadStream(sflMessage);
		var bTraining = bHam || bSpam;
		if (bTraining || bGuess){
			stat.nGeneration++;
		}

		if (bTraining){
			fTrainOnEmail(stream, bHam, stat, function(err,s){
				console.log(s);
				fWriteStats(sflDatabase, stat);
			});
		}
		else{
			fEvaluateEmail(stream, bGuess, stat, function(err,s, sMessage){
				console.log(sMessage);
				if (bGuess){
					fWriteStats(sflDatabase, stat);
				}					
			});
		}
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

		.boolean('g')
		.default('g',false)
		.alias('g', 'guess')
		.describe('g', "Guess on spam status and train sender with result")

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
	aArg["message"] = aArg._[0] || "/dev/stdin";


	// daemon mode
	if (aArg["daemon"]){
		fDaemonMode(aArg);
	}
	// client mode
	else if (aArg["client"]){
		fClientMode(aArg);
	}
	// standalone mode
	else{ 
		fStandaloneMode(aArg);
	}

}

fMain();






