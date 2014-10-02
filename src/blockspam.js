
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
var nsFs = require("fs");
var Yargs = require("yargs");

var aArg = Yargs
	.usage('[-spam|-ham] [-database <database-file>] [<mail-file>]')
	.demand(0)

	.boolean('h')
	.default('h',false)
	.alias('h', 'ham')
	.describe('h', "Message is ham")

	.boolean('s')
	.default('s',false)
	.alias('s', 'spam')
	.describe('s', "Message is spam")

	.string('d')
	.default('d',"spamdb.json")
	.alias('d', 'database')
	.describe('d', "Database file")
	
	.check(function(aArg){return !aArg["ham"] || !aArg["spam"];})
	
	.argv;


/*

// ---------------------------------------------------------------------------
var stream = nsFs.createReadStream(aArg._[0] || "/dev/stdin");

var sMessage = "";

// ---------------------------------------------------------------------------
stream.on('readable', function() {
  var s = stream.read();
  if (s === null) {
		return;
	}

	sMessage += s;
});


// ---------------------------------------------------------------------------
stream.on('end', function() {

	nsFs.readFile(aArg["database"], function(err,buff){
		var stat;
		if (err){
			stat = {
				nGeneration : -1,
				av : {}
			};
		}
		else{
			stat = JSON.parse(buff.toString());
		}

		stat.nGeneration++;
		var vs = fvsProcessMessage(sMessage);

		if (aArg["ham"] || aArg["spam"]){
			fTrackStats(vs, aArg["ham"], stat);
			fPurgeRarities(stat, 0.0005);
			nsFs.writeFile(aArg["database"], JSON.stringify(stat));
			//console.log(stat);
		}
		else{
			var r = frEvaluate(vs, stat);
			console.log("score: ",r);
		}


	});

});
*/


var nsHttp = require('http');
nsFs.readFile(aArg["database"], function(err,buff){
	var stat;
	if (err){
		stat = {
			nGeneration : -1,
			av : {}
		};
	}
	else{
		stat = JSON.parse(buff.toString());
	}
								
	nsHttp.createServer(function (req, res) {
		console.log(req);
		var sMessage = req.body;
		stat.nGeneration++;
		var vs = fvsProcessMessage(sMessage);
																			
		if (aArg["ham"] || aArg["spam"]){
			fTrackStats(vs, aArg["ham"], stat);
			fPurgeRarities(stat, 0.0005);
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.end('added\n');

			//console.log(stat);
		}
		else{
			var r = frEvaluate(vs, stat);
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.end("score: " + r);
		}

	}).listen(1337);
});





