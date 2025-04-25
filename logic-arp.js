// Allows users to create a sequence that keeps repeating. Example use case: to test out melodies.

var NeedsTimingInfo = true;
var activeNotes = [];
var wasPlaying = false;

var isFirstNote = true;
var currentOctave = null;
var octaveSequence = null;
var availableOctaves = null;
var octaveIndex = 0;

function HandleMIDI(event) {
	if (event instanceof NoteOn) {
		activeNotes.push(event);
	 	console.log('add pitch : ' + event.pitch);
	}
	else if (event instanceof NoteOff) {
		// remove note from array
		console.log('remove pitch : ' + event.pitch);
		for (i = 0; i < activeNotes.length; i++) {
			if (activeNotes[i].pitch == event.pitch) {
				activeNotes.splice (i, 1);
				break;
			}
		}
	}
	// pass non-note events through
	else event.send();
	//event.send();

	// sort array of active notes
	activeNotes.sort(sortByPitchAscending);
	// Remove the '//' above to force the note to be in order by pitch
}

//-----------------------------------------------------------------------------
function sortByPitchAscending(a,b) {
	if (a.pitch < b.pitch) return -1;
	if (a.pitch > b.pitch) return 1;
	return 0;
}

//-----------------------------------------------------------------------------
function ProcessMIDI() {
	//if (isFirstNote === undefined)
	//	isFirstNote = true;
		
	// Get timing information from the host application
	var musicInfo = GetTimingInfo();

	// clear activeNotes[] when the transport stops and send any remaining note off events
	if (!musicInfo.playing){
	 	if (wasPlaying) {
			console.log('stop ' + wasPlaying + ' ' + musicInfo.playing + ' ' + activeNotes.length);
			MIDI.allNotesOff();
			isFirstNote = true;
			currentOctave = null;
			octaveSequence = null;
			availableOctaves = null;
			octaveIndex = 0;
		}
	}

	wasPlaying = musicInfo.playing;

	if (activeNotes.length != 0) {
		// get parameters
		var division = GetParameter("Beat Division");
		var noteOrder = GetParameter("Note Order");
		var noteLength = (GetParameter("Note Length") / 100) * (1 / division);
		var randomLength = Math.random() * ((GetParameter("Random Length") / 100) * (1 / division));
		var randomDelay = Math.random() * ((GetParameter("Random Delay") / 100) * (1 / division));

		// calculate beat to schedule
		var lookAheadEnd = musicInfo.blockEndBeat;
		var nextBeat = Math.ceil(musicInfo.blockStartBeat * division) / division;

		// when cycling, find the beats that wrap around the last buffer
		if (musicInfo.cycling && lookAheadEnd >= musicInfo.rightCycleBeat) {
			if (lookAheadEnd >= musicInfo.rightCycleBeat) {
				var cycleBeats = musicInfo.rightCycleBeat - musicInfo.leftCycleBeat;
				var cycleEnd = lookAheadEnd - cycleBeats;
			}
		}

		var state = GetParameter("Reset");
		
	    if (state == 1) {
	      	Reset();
	    }

		// loop through the beats that fall within this buffer
		while ((nextBeat >= musicInfo.blockStartBeat && nextBeat < lookAheadEnd && state == 0)
				// including beats that wrap around the cycle point
				|| (musicInfo.cycling && nextBeat < cycleEnd)) {
			// adjust for cycle
			if (musicInfo.cycling && nextBeat >= musicInfo.rightCycleBeat)
				nextBeat -= cycleBeats;

			// calculate step
			var step = Math.floor(nextBeat / (1 / division) - division);
			var randomOctave = findNoteOctave(step);
			var chosenNote = chooseNote(noteOrder, step);
			
			// send events
			var noteOn = new NoteOn(chosenNote);
			//console.log('old pitch ' + noteOn.pitch + ' ' + randomOctave);
			noteOn.pitch = MIDI.normalizeData(noteOn.pitch + randomOctave);
			//console.log('new pitch ' + noteOn.pitch);
			noteOn.sendAtBeat(nextBeat + randomDelay);
			var noteOff = new NoteOff(noteOn);
			noteOff.sendAtBeat(nextBeat + randomDelay + noteLength + randomLength)

			// advance to next beat
			nextBeat += 0.001;
			nextBeat = Math.ceil(nextBeat * division) / division;
		}
	}
}

function findNoteOctave(step) {
	var noteOrder = GetParameter("Note Order");
	var isFirstNote = (step % activeNotes.length == 0);
	//console.log('isFirstNote after '+ step + ' : ' + isFirstNote + ' ' + currentOctave);

	if (isFirstNote || currentOctave === null) {
		//-- Reset sequence
		if (octaveIndex == 0) {
			availableOctaves = getAvailableOctaves();
			octaveSequence = makeNewSequence(availableOctaves);
		}
		
		currentOctave = octaveSequence[octaveIndex];
		
		octaveIndex++;
		if (octaveIndex > octaveSequence.length - 1)
			octaveIndex = 0;
	}
	
	return currentOctave;
}

function makeNewSequence(items) {
	console.log('makeNewSequence');
	RandomGenerator.reseedFromPlayhead(GetTimingInfo());
	prevSeq = octaveSequence;
	newSeq = items;
	var i = 0;
	do {
		newSeq = shuffleArray(newSeq);
		i++;
	} while (i < 10 && prevSeq && newSeq[0] == prevSeq[prevSeq.length - 1]);
	//console.log('octaveSequence : ' + prevSeq + ' > ' + newSeq);
	return newSeq;
}

function shuffleArray(arr) {
	var shuffledArr = [...arr];
	shuffledArr.sort(function () {
		return customRandom() - 0.5;
	});
	return shuffledArr;
}

function getAvailableOctaves() {

	//if (availableOctaves === null) {
		var arr = [];
		var octavesTotal = GetParameter("Random Octave");
		var octavesOffset = Math.floor(octavesTotal / 2);
		for (var i = 0; i < octavesTotal; i++)
			arr[i] = (i - octavesOffset) * 12;
		availableOctaves = arr;
	//}
	return availableOctaves;
}

function Reset() {
  NeedsTimingInfo = true;
  activeNotes = [];
  SetParameter ("Reset", 0);
}


var RandomGenerator = {
	//-- generates 4 good seeds
	cyrb128: function(str) {
	    let h1 = 1779033703, h2 = 3144134277,
	        h3 = 1013904242, h4 = 2773480762;
	    for (let i = 0, k; i < str.length; i++) {
	        k = str.charCodeAt(i);
	        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
	        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
	        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
	        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	    }
	    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	    return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
	},
	
	//-- generate a rand function
	sfc32: function(a, b, c, d) {
	    return function() {
	      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
	      var t = (a + b) | 0;
	      a = b ^ b >>> 9;
	      b = c + (c << 3) | 0;
	      c = (c << 21 | c >>> 11);
	      d = d + 1 | 0;
	      t = t + d | 0;
	      c = c + t | 0;
	      return (t >>> 0) / 4294967296;
	    }
	},
	
	//-- generate a rand function
	mulberry32: function(a) {
	    return function() {
	      var t = a += 0x6D2B79F5;
	      t = Math.imul(t ^ t >>> 15, t | 1);
	      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
	      return ((t ^ t >>> 14) >>> 0) / 4294967296;
	    }
	},
	
 	xoshiro128ss: function(a, b, c, d) {
	    return function() {
	        var t = b << 9, r = a * 5; r = (r << 7 | r >>> 25) * 9;
	        c ^= a; d ^= b;
	        b ^= c; a ^= d; c ^= t;
	        d = d << 11 | d >>> 21;
	        return (r >>> 0) / 4294967296;
	    }
	},
	
	jsf32: function(a, b, c, d) {
	    return function() {
	        a |= 0; b |= 0; c |= 0; d |= 0;
	        var t = a - (b << 27 | b >>> 5) | 0;
	        a = b ^ (c << 17 | c >>> 15);
	        b = c + d | 0;
	        c = d + t | 0;
	        d = a + t | 0;
	        return (d >>> 0) / 4294967296;
	    }
	},
	
	
	init() {
		this.seed = 1337 ^ 0xDEADBEEF; // 32-bit seed with optional XOR value
		this.rand = this.generateRandFunction();
	},
	
	generateRandFunction(secondarySeed = 0xB7E15162, tierciarySeed = 1) {
		var fn = this.sfc32(0x9E3779B9, 0x243F6A88, secondarySeed, this.seed * tierciarySeed);
		return fn;
	},
	
	reseedFromPlayhead(timingInfo) {
		var timeSeed = Math.floor(timingInfo.blockStartBeat * 100) * 1000000;
		/*if (timingInfo.playing)
			console.log('reseedFromPlayhead blockStartBeat ' + timeSeed);*/
		
		this.rand = this.generateRandFunction(timeSeed, GetParameter("Random Seed"));
		for (var i = 0; i < 15; i++) 
			this.rand();
	}
	
	
}
RandomGenerator.init();

var customRandom = function() {
	if (GetParameter("Real Randomness"))
		var num = Math.random();
	else
		var num = RandomGenerator.rand();
		
	return num;
}



//-----------------------------------------------------------------------------
var noteOrders = ["up", "down", "random"];

function chooseNote(noteOrder, step) {
	var order = noteOrders[noteOrder];
	var length = activeNotes.length
	if (order == "up") return activeNotes[step % length];
	if (order == "down") return activeNotes[Math.abs(step % length - (length - 1))];
	if (order == "random") return activeNotes[Math.floor(Math.random() * length)];
	else return 0;
}

//-----------------------------------------------------------------------------
var PluginParameters =
[
		{name:"Reset", type:"menu", valueStrings:["Off", "On"],
		minValue:0, maxValue:1, numberOfSteps: 2, defaultValue:0},

		{name:"Real Randomness", type:"menu", valueStrings:["Off", "On"],
		minValue:0, maxValue:1, numberOfSteps: 2, defaultValue:0},

		{name:"Random Seed", type:"linear",
		minValue:1, maxValue:200, numberOfSteps:199, defaultValue:1},

		{name:"Beat Division", type:"linear",
		minValue:1, maxValue:16, numberOfSteps:15, defaultValue:1},

		{name:"Note Order", type:"menu", valueStrings:noteOrders,
		minValue:0, maxValue:2, numberOfSteps: 3, defaultValue:0},

		{name:"Note Length", unit:"%", type:"linear",
		minValue:1, maxValue:200, defaultValue:100.0, numberOfSteps:199},

		{name:"Random Length", unit:"%", type:"linear",
		minValue:0, maxValue:200, numberOfSteps: 200, defaultValue:0},

		{name:"Random Delay", unit:"%", type:"linear",
		minValue:0, maxValue:200, numberOfSteps:200, defaultValue:0},

		{name:"Random Octave", type:"linear",
		minValue:1, maxValue:6, defaultValue:1, numberOfSteps:5}
];

// ----------------------------------------------------------------------------
// Code from plugin.js

// Copy and paste this chunk of code into your script editor to create controls in your plugin

// var PluginParameters = [];

// Types of Plugin Parameters
const LINEAR_FADER = "lin";
const LOGARITHMIC_FADER = "log";
const MOMENTARY_BUTTON = "momentary";
const MENU = "menu";
const NOT_NEEDED = "";

/*
To create a plugin parameter (a fader or knob that changes something is a basic way of desribing it), call the createPluginParameter function as follows:
createPluginParameter("Enter a name in quotes", Enter a type from above in quotes (for example: LINEAR_FADER), Enter a minimum value, Enter a maximum value, Enter a default value, enter the number of steps, "Enter a unit in quotes", "Enter text to create a divider/header in the plug-in", Enter a list of value strings if you are creating a menu as follows: ["something", "something", "something"]);
*/

function createPluginParameter (name, type, minValue, maxValue, defaultValue, numberOfSteps, unit, text, valueStrings) {
  if (type == MENU) {
    PluginParameters.push (createMenuPluginParameter (name, type, minValue, maxValue, defaultValue, numberOfSteps, unit, text, valueStrings));
  }
  else {
    PluginParameters.push (createBasicPluginParameter (name, type, minValue, maxValue, defaultValue, numberOfSteps, unit, text));
  }
}

function createBasicPluginParameter (name, type, minValue, maxValue, defaultValue, numberOfSteps, unit, text) {
  return {name: name, type: type, minValue: minValue, maxValue: maxValue, numberOfSteps: numberOfSteps, unit: unit, text: text};
}

function createMenuPluginParameter (name, type, minValue, maxValue, defaultValue, numberOfSteps, unit, text, valueStrings) {
  return {name: name, type: type, minValue: minValue, maxValue: maxValue, numberOfSteps: numberOfSteps, unit: unit, text: text, valueStrings: valueStrings};
}

var console = {
   maxFlush: 20,
   b:[],
   log: function(msg) {this.b.push(msg)},
   flush: function() {
       var i=0;
       while(i<=this.maxFlush && this.b.length>0) {
           Trace(this.b.shift());
           i++;
       }
   }
};
function Idle() {
   console.flush();
}
//Parameters for the plugin