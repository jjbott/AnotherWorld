define(function (require, exports, module) {var Point = require('./point');

module.exports = class Polygon {
    readVertices(reader, zoom) {
        this.bbw = reader.readZoomedCoord(zoom);
        this.bbh = reader.readZoomedCoord(zoom);
        this.numPoints = reader.readByte();
        this.points = new Array(this.numPoints);
        //Read all points, directly from bytecode segment
        for (var i = 0; i < this.numPoints; ++i) {
            this.points[i] = new Point(reader.readZoomedCoord(zoom),reader.readZoomedCoord(zoom));
        }
    }
}
});
