define(function (require, exports, module) {var files = require("files")
var ByteReader = require("byteReader")
var MemEntry = require("memEntry")
var Bank = require("bank")

var ResType = {
    RT_SOUND  : 0,
    RT_MUSIC  : 1,
    RT_POLY_ANIM : 2, // full screen video buffer, size=0x7D00 

    // FCS: 0x7D00=32000...but 320x200 = 64000 ??
    // Since the game is 16 colors, two pixels palette indices can be stored in one byte
    // that's why we can store two pixels palette indice in one byte and we only need 320*200/2 bytes for
    // an entire screen.

    RT_PALETTE    : 3, // palette (1024=vga + 1024=ega), size=2048
    RT_BYTECODE : 4,
    RT_POLY_CINEMATIC   : 5
};

module.exports = class Resources {

    readBank(memEntry) {

        // Dont try loading from anything other than bank 1. The rest is probably sound and music, which isnt supported.
        if ( memEntry.bankId != 1 ){
            return new ByteReader({byteArray: new Uint8Array(0)});
        }
    
        var bank = new Bank();
        return bank.read(memEntry);    
    }

    init() {
        var reader = new ByteReader({b64Str:files.memlist});
        const MEMENTRY_STATE_END_OF_MEMLIST = 0xff;

        this.memEntries = new Array();
        while (true) {
            var memEntry = new MemEntry(reader);
            this.memEntries.push(memEntry);

            if (memEntry.state == MEMENTRY_STATE_END_OF_MEMLIST) {
                break;
            }
        }
    }

    /*
	Go over every resource and check if they are marked at "MEMENTRY_STATE_LOAD_ME".
	Load them in memory and mark them are MEMENTRY_STATE_LOADED
    */
    loadMarkedAsNeeded() {
        this.memEntries.forEach(e => {
            if ( e.state == MemEntry.MEMENTRY_STATE_LOAD_ME && e.bankId > 0) {

                if (!e.bufPtr) {
                    var bankReader = this.readBank(e);
                    e.bufPtr = bankReader;
                }                
                e.state = MemEntry.MEMENTRY_STATE_LOADED;
                e.bufPtr.pos = 0;

                if (e.type == ResType.RT_POLY_ANIM) {
                    this._vidCurPtr = e.bufPtr;
                } else {
                    this.scriptCurPtr = e.bufPtr;
                }
            }
        });
    }

    setupPart(partId) {
        if (partId == this.currentPartId)
            return;

        // TODO
        //if (partId < GAME_PART_FIRST || partId > GAME_PART_LAST)
        //    error("Resource::setupPart() ec=0x%X invalid partId", partId);


        // from parts.cpp. No idea where they came from, or if the Amiga version matches.
        var GAME_NUM_PARTS = 10;
        var memListParts = [
            //MEMLIST_PART_PALETTE   MEMLIST_PART_CODE   MEMLIST_PART_VIDEO1   MEMLIST_PART_VIDEO2
            [0x14, 0x15, 0x16, 0x00], // protection screens
            [0x17, 0x18, 0x19, 0x00], // introduction cinematic
            [0x1A, 0x1B, 0x1C, 0x11],
            [0x1D, 0x1E, 0x1F, 0x11],
            [0x20, 0x21, 0x22, 0x11],
            [0x23, 0x24, 0x25, 0x00], // battlechar cinematic
            [0x26, 0x27, 0x28, 0x11],
            [0x29, 0x2A, 0x2B, 0x11],
            [0x7D, 0x7E, 0x7F, 0x00],
            [0x7D, 0x7E, 0x7F, 0x00]  // password screen
        ];
        //For each part of the game, four resources are referenced.
        var MEMLIST_PART_PALETTE = 0
        var MEMLIST_PART_CODE = 1
        var MEMLIST_PART_POLY_CINEMATIC = 2
        var MEMLIST_PART_VIDEO2 = 3


        var MEMLIST_PART_NONE = 0x00

        // partId passed as unknown hex instead of 0 indexed
        var memListPartIndex = 1;//partId - GAME_PART_FIRST;

        // TODO, not sure where these values are coming from. Might match DOS version, who knows.
        var paletteIndex = memListParts[memListPartIndex][MEMLIST_PART_PALETTE];
        var codeIndex = memListParts[memListPartIndex][MEMLIST_PART_CODE];
        var videoCinematicIndex = memListParts[memListPartIndex][MEMLIST_PART_POLY_CINEMATIC];
        var video2Index = memListParts[memListPartIndex][MEMLIST_PART_VIDEO2];

        // Mark all resources as located on harddrive.
        this.invalidateAll();

        this.memEntries[paletteIndex].state = MemEntry.MEMENTRY_STATE_LOAD_ME;
        this.memEntries[codeIndex].state = MemEntry.MEMENTRY_STATE_LOAD_ME;
        this.memEntries[videoCinematicIndex].state = MemEntry.MEMENTRY_STATE_LOAD_ME;

        // This is probably a cinematic or a non interactive part of the game.
        // Player and enemy polygons are not needed.
        if (video2Index != MEMLIST_PART_NONE)
            this.memEntries[video2Index].state = MemEntry.MEMENTRY_STATE_LOAD_ME;


        this.loadMarkedAsNeeded();

        this.segPalettes = this.memEntries[paletteIndex].bufPtr;
        this.segBytecode = this.memEntries[codeIndex].bufPtr;
        this.segCinematic = this.memEntries[videoCinematicIndex].bufPtr;

        // This is probably a cinematic or a non interactive part of the game.
        // Player and enemy polygons are not needed.
        if (video2Index != MEMLIST_PART_NONE)
            this._segVideo2 = _memList[video2Index].bufPtr;

        this.currentPartId = partId
    }

    invalidateAll() {
        // Marks all resources as "not needed".
        // Not going to bother unloaded them from memory though.

    }

    /* This method serves two purpose: 
    - Load parts in memory segments (palette,code,video1,video2)
	           or
    - Load a resource in memory

	This is decided based on the resourceId. If it does not match a mementry id it is supposed to 
	be a part id. */
loadPartsOrMemoryEntry(resourceId) {

	if (resourceId > this.memEntries.length) {

		this.requestedNextPart = resourceId;

	} else {

		var memEntry = this.memEntries[resourceId];

		if (memEntry.state == MemEntry.MEMENTRY_STATE_NOT_NEEDED) {
			memEntry.state = MemEntry.MEMENTRY_STATE_LOAD_ME;
			this.loadMarkedAsNeeded();
		}
	}

}
}

});
