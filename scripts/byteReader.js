define(function (require, exports, module) {var Base64Binary = require('lib/Base64Binary');

module.exports = class ByteReader {
    constructor( opts ){//b64Str, byteArray) {
        if ( opts.b64Str ) {
            this.byteArray = Base64Binary.decode(opts.b64Str);
        }
        else {
            this.byteArray = opts.byteArray;
        }

        this.reverse = false;
        if ( opts.reverse ){
            this.reverse = opts.reverse;
        }

        this.pos = 0;
        if ( this.reverse ){
            this.pos = this.byteArray.length - 1;
        }

    };
    readByte() {
        if ( this.pos < 0 || this.pos >= this.byteArray.length) {
            throw "readByte out of bounds";
        }

        var ret = this.byteArray[this.pos];
        if ( this.reverse ){
            --this.pos
        }
        else{
            ++this.pos
        }
        return ret;
    }
    readUint16BE() {
        var h = this.readByte();
        var l = this.readByte();
        
        if ( this.reverse ){
            return (l << 8) + h;
        }
        else{
            return (h << 8) + l;
        }
    }
    readInt16BE() {
        var val = this.readUint16BE();
        if ( val & 0x8000 ){
            val -= (1<<16);
        }
        return val;
    }
    readUint32BE() {
        if ( this.reverse ){
            return ((this.readByte()) + (this.readByte() << 8) + (this.readByte() << 16) + (this.readByte() << 24)) >>> 0;
        }
        else{
            return ((this.readByte() << 24) + (this.readByte() << 16) + (this.readByte() << 8) + this.readByte()) >>> 0;
        }
        
    }
    getReader(size, reverse) {
        return new ByteReader( {byteArray : this.byteArray.slice(this.pos, this.pos + size), reverse: reverse});
    }
    readZoomedCoord(zoom) {
        return Math.trunc(this.readByte() * zoom / 64);
    }
}
});
