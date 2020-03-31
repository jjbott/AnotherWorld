define(function (require, exports, module) {var files = require('./files');
var ByteReader = require('./byteReader');
var ByteWriter = require('./byteWriter');

module.exports = class Bank {
    constructor() {
        this.unpackContext = {
            size: 0,
            crc: 0,
            chk: 0,
            datasize: 0
        };
    }

    read(memEntry) {//, uint8_t *buf) {

        var bankReader = new ByteReader({b64Str : files.banks[memEntry.bankId]});
        bankReader.pos = memEntry.bankOffset;

        // Depending if the resource is packed or not we
        // can read directly or unpack it.
        if (memEntry.packedSize == memEntry.size) {
            return bankReader.getReader(memEntry.packedSize);
        } else {
            var reader = bankReader.getReader(memEntry.packedSize, true)
            var writer = new ByteWriter(memEntry.size);
            return this.unpack(reader, writer);
        }
    }

    decUnk1(reader, writer, numChunks, addCount) {
        var count = this.getCode(reader, numChunks) + addCount + 1;
        //console.log(`Bank::decUnk1(${numChunks}, ${addCount}) count=${count}`);
        this.unpackContext.datasize -= count;
        while (count--) {
            writer.writeByte(this.getCode(reader, 8));
        }
    }

    /*
       Note from fab: This look like run-length encoding.
    */
    decUnk2(reader, writer, numChunks) {
        var i = this.getCode(reader, numChunks);
        var count = this.unpackContext.size + 1;
        //console.log(`Bank::decUnk2(${numChunks}), i=${i}) count=${count}`);
        this.unpackContext.datasize -= count;
        while (count--) {
            writer.repeatWriteByte();
        }
    }

    /*
        Most resource in the banks are compacted.
    */
    unpack(entryReader, writer) {
        this.unpackContext.size = 0;
        this.unpackContext.datasize = entryReader.readUint32BE();
        this.unpackContext.crc = entryReader.readUint32BE();
        this.unpackContext.chk = entryReader.readUint32BE();
        this.unpackContext.crc = (this.unpackContext.crc ^ this.unpackContext.chk) >>> 0;
        do {
            if (!this.nextChunk(entryReader, writer)) {
                this.unpackContext.size = 1;
                if (!this.nextChunk(entryReader, writer)) {
                    this.decUnk1(entryReader, writer, 3, 0);
                } else {
                    this.decUnk2(entryReader, writer, 8);
                }
            } else {
                var c = this.getCode(entryReader, 2);
                if (c == 3) {
                    this.decUnk1(entryReader, writer, 8, 8);
                } else {
                    if (c < 2) {
                        this.unpackContext.size = c + 2;
                        this.decUnk2(entryReader, writer, c + 9);
                    } else {
                        this.unpackContext.size = this.getCode(entryReader, 8);
                        this.decUnk2(entryReader, writer, 12);
                    }
                }
            }
        } while (this.unpackContext.datasize > 0);

        if ( this.unpackContext.crc != 0) throw "crc check failed";

        return writer.getReader();
    }

    getCode(reader, numChunks) {
        var c = 0;
        while (numChunks--) {
            c <<= 1;
            if (this.nextChunk(reader)) {
                c |= 1;
            }
        }
        return c;
    }

    nextChunk(entryReader) {
        var CF = this.rcr(false);
        if (this.unpackContext.chk == 0) {
            if ( this.unpackContext.crc == 0) {
                throw "crc alredy 0, probably should be finished decompressing"
            }
            this.unpackContext.chk = entryReader.readUint32BE();
            this.unpackContext.crc = (this.unpackContext.crc ^ this.unpackContext.chk) >>> 0;

            //console.log(`crc ${this.unpackContext.crc}`)
            CF = this.rcr(true);
        }
        //console.log(`nextChunk ${CF}`);
        return CF;
    }

    rcr(CF) {
        var rCF = (this.unpackContext.chk & 1);
        this.unpackContext.chk >>>= 1;
        if (CF) {
            this.unpackContext.chk = (this.unpackContext.chk | 0x80000000 ) >>> 0;
        }
        return rCF;
    }

}
});
