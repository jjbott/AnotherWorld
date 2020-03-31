define(function (require, exports, module) {module.exports = class MemEntry {
    constructor(reader) {
        this.state = reader.readByte();
        this.type = reader.readByte();
        this.bufPtr = null; reader.readUint16BE();
        this.unk4 = reader.readUint16BE();
        this.rankNum = reader.readByte();
        this.bankId = reader.readByte();
        this.bankOffset = reader.readUint32BE();
        this.unkC = reader.readUint16BE();
        this.packedSize = reader.readUint16BE();
        this.unk10 = reader.readUint16BE();
        this.size = reader.readUint16BE();
    };
}
module.exports.MEMENTRY_STATE_END_OF_MEMLIST = 0xFF
module.exports.MEMENTRY_STATE_NOT_NEEDED = 0 
module.exports.MEMENTRY_STATE_LOADED = 1
module.exports.MEMENTRY_STATE_LOAD_ME = 2
});
