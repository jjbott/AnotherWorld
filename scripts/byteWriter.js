define(function (require, exports, module) {var ByteReader = require('./byteReader');

module.exports = class ReverseByteWriter {
    constructor(size) {
        this.byteArray = new Uint8Array(size);
        this.pos = size -1;
    };
    writeByte(b) {
        //console.log(b);
        this.byteArray[this.pos--] = b;
    }
    repeatWriteByte() {
        this.writeByte(this.byteArray[this.pos]);
    }
    writeUint16BE(i) {
        this.writeByte(i>>8);
        this.writeByte(i & 0xff);
    }
    writeUint32BE() {
        this.writeByte(i>>24);
        this.writeByte(i>>16 & 0xff);
        this.writeByte(i>>8 & 0xff);
        this.writeByte(i & 0xff);
    }
    getReader() {
        return new ByteReader({byteArray: this.byteArray});
    }
}
});
