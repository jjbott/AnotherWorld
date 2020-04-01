define(function (require, exports, module) {
	var Polygon = require('polygon');
	var Point = require('point');
	var staticRes = require('staticRes');

	var NO_PALETTE_CHANGE_REQUESTED = 0xFF
	module.exports = class Video {
		constructor(resource, system) {
			this.res = resource;
			this.sys = system;
			this.polyCount = 0;
		}

		init() {

			this.paletteIdRequested = NO_PALETTE_CHANGE_REQUESTED;
			this.pages = [
				document.getElementById(`page0`),
				document.getElementById(`page1`),
				document.getElementById(`page2`),
				document.getElementById(`page3`)
			]

			this._curPagePtr3 = this.getPage(1);
			this._curPagePtr2 = this.getPage(2);


			this.changePagePtr1(0xFE);
		}

		setDataBuffer(dataBuf, offset) {

			this._dataBuf = dataBuf;
			this._dataBuf.pos = offset;
		}


		/*  A shape can be given in two different ways:
		
			 - A list of screenspace vertices.
			 - A list of objectspace vertices, based on a delta from the first vertex.
		
			 This is a recursive function. */
		readAndDrawPolygon(color, zoom, pt) {

			var i = this._dataBuf.readByte();

			//This is 
			if (i >= 0xC0) {	// 0xc0 = 192

				// WTF ?
				if (color & 0x80) {   //0x80 = 128 (1000 0000)
					color = i & 0x3F; //0x3F =  63 (0011 1111)   
				}

				// pc is misleading here since we are not reading bytecode but only
				// vertices informations.
				var polygon = new Polygon();
				polygon.readVertices(this._dataBuf, zoom);

				this.fillPolygon(polygon, color, zoom, pt);



			} else {
				i &= 0x3F;  //0x3F = 63
				if (i == 1) {
					//warning("Video::readAndDrawPolygon() ec=0x%X (i != 2)", 0xF80);
				} else if (i == 2) {
					this.readAndDrawPolygonHierarchy(zoom, pt);

				} else {
					//warning("Video::readAndDrawPolygon() ec=0x%X (i != 2)", 0xFBB);
				}
			}



		}

		fillPolygon(polygon, color, zoom, pt) {


			var x1 = pt.x - Math.trunc(polygon.bbw / 2);
			var x2 = pt.x + Math.trunc(polygon.bbw / 2);
			var y1 = pt.y - Math.trunc(polygon.bbh / 2);
			var y2 = pt.y + Math.trunc(polygon.bbh / 2);

			if (x1 > 319 || x2 < 0 || y1 > 199 || y2 < 0) {
				//console.log(`fillPolygon() skipping - color: ${color}, zoom ${zoom}, x ${pt.x}, y ${pt.y}, x1 ${x1}, y1 ${y1}, x2 ${x2}, y2 ${y2}, bbw ${polygon.bbw}, bbh ${polygon.bbh}`);
				return;
			}

			var pl = `fillPolygon() - color: ${color}, zoom ${zoom}, x ${pt.x}, y ${pt.y}, x1 ${x1}, y1 ${y1}, x2 ${x2}, y2 ${y2}, bbw ${polygon.bbw}, bbh ${polygon.bbh}`;
			//console.log(pl);

			if (polygon.bbw == 0 && polygon.bbh == 1 && polygon.numPoints == 4) {
				this.drawPoint(color, pt.x, pt.y);

				return;
			}

			var polyDiv = document.createElement("div");
			polyDiv.classList = `polygon color${color}`;
			polyDiv.style = `left:${x1}; top:${y1};width:${polygon.bbw + 1}px; height:${polygon.bbh}px;`

			if (polygon.bbw == 0 || polygon.bbh == 1) {


			}
			else {
				var polyPoints = new Array(polygon.numPoints);

				// Poly coordinates assume max x is drawn, max y is not drawn.
				// ex: [[1,0],[1,1],[0,1],[0,0]] will draw a rectangle 2 pixels wide, 1 pixel tall
				// So, extend the right side of the poly by 1 pixel to make sure it gets drawn

				// First we need to determine which half of points is the right side.
				// Cant just compare the first set of x values, because they're the same sometimes.
				var firstHalfRight = true;
				for (var i = polygon.numPoints / 2; i < polygon.numPoints; ++i) {
					var j = polygon.numPoints - i - 1;
					if (polygon.points[i].x > polygon.points[j].x) {
						firstHalfRight = false;
					}
					break;
				}

				for (var i = 0; i < polygon.numPoints; ++i) {
					var j = polygon.numPoints - i - 1;
					var polyX = polygon.points[i].x;

					if (firstHalfRight && (i < (polygon.numPoints / 2))) {
						// Only increase if it wouldnt create a twist
						if ((polyX + 1) > polygon.points[j].x) {
							polyX++;
						}
					}
					else if (!firstHalfRight && (i >= (polygon.numPoints / 2))) {
						// Only increase if it wouldnt create a twist
						if ((polyX + 1) < polygon.points[j].x) {
							polyX++;
						}
					}

					polyPoints[i] = `${polyX}px ${polygon.points[i].y}px`
				}
				polyDiv.style.clipPath = `polygon(${polyPoints.join(',')})`
			}
			this._curPagePtr1.appendChild(polyDiv);
			return;
		}

		/*
			What is read from the bytecode is not a pure screnspace polygon but a polygonspace polygon.
		
		*/
		readAndDrawPolygonHierarchy(zoom, pgc) {

			var pt = new Point(pgc.x, pgc.y);

			pt.x -= this._dataBuf.readZoomedCoord(zoom);
			pt.y -= this._dataBuf.readZoomedCoord(zoom);

			var childs = this._dataBuf.readByte();
			//console.log(`Video::readAndDrawPolygonHierarchy childs=${childs}`);

			for (; childs >= 0; --childs) {

				var off = this._dataBuf.readUint16BE();

				var po = new Point(pt.x, pt.y);

				po.x += this._dataBuf.readZoomedCoord(zoom);
				po.y += this._dataBuf.readZoomedCoord(zoom);

				if (po.x > 30768) {
					debugger;
				}

				var color = 0xFF;
				var _bp = off;
				off &= 0x7FFF;

				if (_bp & 0x8000) {
					color = this._dataBuf.readByte() & 0x7F;
					this._dataBuf.readByte(); // throw away a byte? 
					//_pData.pc += 2;
				}

				var bak = this._dataBuf.pos;
				this._dataBuf.pos = off * 2;

				this.readAndDrawPolygon(color, zoom, po);

				this._dataBuf.pos = bak;
			}


		}

		drawString(/*uint8_t*/ color, /*uint16_t*/ x, /*uint16_t*/ y, /*uint16_t*/ stringId) {

			var str = staticRes.stringsTableEng[stringId];

			//console.log(`drawString(${color}, ${x}, ${y}, ${stringId}, ${str}`);

			//Used if the string contains a return carriage.
			var xOrigin = x;
			var len = str.length;
			for (var i = 0; i < len; ++i) {

				if (str[i] == '\n') {
					y += 8;
					x = xOrigin;
					continue;
				}

				this.drawChar(str[i], x, y, color, this._curPagePtr1);
				x++;

			}
		}

		drawChar(/*uint8_t*/ character, /*uint16_t*/ x, /*uint16_t*/ y, /*uint8_t*/ color, /*uint8_t **/buf) {
			if (x <= 39 && y <= 192) {

				var fontPos = (character.charCodeAt(0) - ' '.charCodeAt(0)) * 8;

				for (var j = 0; j < 8; ++j) {
					var ch = staticRes.font[fontPos + j];
					for (var i = 0; i < 4; ++i) {
						if (ch & 0x80) {
							this.drawPoint(color, (x * 8) + (i * 2), y + j);
						}
						ch = (ch << 1) >>> 0;
						if (ch & 0x80) {
							this.drawPoint(color, (x * 8) + (i * 2) + 1, y + j);
						}
						ch = (ch << 1) >>> 0;
					}
				}
			}
		}

		drawPoint(color, x, y) {
			//console.log(`drawPoint(${color}, ${x}, ${y})`);

			var polyDiv = document.createElement("div");
			polyDiv.classList = `point color${color}`;
			polyDiv.style = `left:${x}; top:${y};`
			this._curPagePtr1.appendChild(polyDiv);
			return;
		}

		/* Blend a line in the current framebuffer (_curPagePtr1)
		*/
		drawLineBlend(x1, x2, color) {
			//console.log(`drawLineBlend({x1}, {x2}, {color})`);

			/*
			int16_t xmax = MAX(x1, x2);
			int16_t xmin = MIN(x1, x2);
			uint8_t *p = _curPagePtr1 + _hliney * 160 + xmin / 2;
		
			uint16_t w = xmax / 2 - xmin / 2 + 1;
			uint8_t cmaske = 0;
			uint8_t cmasks = 0;	
			if (xmin & 1) {
				--w;
				cmasks = 0xF7;
			}
			if (!(xmax & 1)) {
				--w;
				cmaske = 0x7F;
			}
		
			if (cmasks != 0) {
				*p = (*p & cmasks) | 0x08;
				++p;
			}
			while (w--) {
				*p = (*p & 0x77) | 0x88;
				++p;
			}
			if (cmaske != 0) {
				*p = (*p & cmaske) | 0x80;
				++p;
			}
		*/

		}

		drawLineN(x1, x2, color) {
			//console.log(`drawLineN({x1}, {x2}, {color})`);
			/*
			int16_t xmax = MAX(x1, x2);
			int16_t xmin = MIN(x1, x2);
			uint8_t *p = _curPagePtr1 + _hliney * 160 + xmin / 2;
		
			uint16_t w = xmax / 2 - xmin / 2 + 1;
			uint8_t cmaske = 0;
			uint8_t cmasks = 0;	
			if (xmin & 1) {
				--w;
				cmasks = 0xF0;
			}
			if (!(xmax & 1)) {
				--w;
				cmaske = 0x0F;
			}
		
			uint8_t colb = ((color & 0xF) << 4) | (color & 0xF);	
			if (cmasks != 0) {
				*p = (*p & cmasks) | (colb & 0x0F);
				++p;
			}
			while (w--) {
				*p++ = colb;
			}
			if (cmaske != 0) {
				*p = (*p & cmaske) | (colb & 0xF0);
				++p;		
			}
		
			//
			//sys->updateDisplay(_curPagePtr2);
			//this->sys->sleep(10);
			*/
		}

		drawLineP(x1, x2, color) {
			//console.log(`drawLineP({x1}, {x2}, {color})`);
			/*
			debug(DBG_VIDEO, "drawLineP(%d, %d, %d)", x1, x2, color);
			int16_t xmax = MAX(x1, x2);
			int16_t xmin = MIN(x1, x2);
			uint16_t off = _hliney * 160 + xmin / 2;
			uint8_t *p = _curPagePtr1 + off;
			uint8_t *q = _pages[0] + off;
		
			uint8_t w = xmax / 2 - xmin / 2 + 1;
			uint8_t cmaske = 0;
			uint8_t cmasks = 0;	
			if (xmin & 1) {
				--w;
				cmasks = 0xF0;
			}
			if (!(xmax & 1)) {
				--w;
				cmaske = 0x0F;
			}
		
			if (cmasks != 0) {
				*p = (*p & cmasks) | (*q & 0x0F);
				++p;
				++q;
			}
			while (w--) {
				*p++ = *q++;			
			}
			if (cmaske != 0) {
				*p = (*p & cmaske) | (*q & 0xF0);
				++p;
				++q;
			}
		*/
		}


		getPage(page) {
			if (page <= 3) {
				return this.pages[page];
			} else {
				switch (page) {
					case 0xFF:
						return this._curPagePtr3;
						break;
					case 0xFE:
						return this._curPagePtr2;
						break;
					default:
						//return this.pages[0]; // XXX check
						debugger;
						//warning("Video::getPage() p != [0,1,2,3,0xFF,0xFE] == 0x%X", page);
						break;
				}
			}
		}



		changePagePtr1(pageID) {
			//console.log(`Video::changePagePtr1(${pageID})`);
			this._curPagePtr1 = this.getPage(pageID);
		}

		fillPage(pageId, color) {
			//console.log(`Video::fillPage(${pageId}, ${color})`);
			var page = this.getPage(pageId);

			page.textContent = '';

			var div = document.createElement("div")
			div.classList = `polygon color${color}`;
			div.style = `left:0; top 0;width:320px; height: 200px`
			page.appendChild(div);

			//memset(p, c, VID_PAGE_SIZE);
		}

		/*  This opcode is used once the background of a scene has been drawn in one of the framebuffer:
			   it is copied in the current framebuffer at the start of a new frame in order to improve performances. */
		copyPage(srcPageId, dstPageId, vscroll) {

			//console.log(`Video::copyPage(${srcPageId}, ${dstPageId} ${vscroll})`);

			if (srcPageId == dstPageId)
				return;

			if (srcPageId >= 0xFE || !((srcPageId &= 0xBF) & 0x80)) {

				var src = this.getPage(srcPageId);
				var dst = this.getPage(dstPageId);

				var clone = src.cloneNode(true);
				dst.textContent = '';
				dst.append(...clone.children);

			} else {
				throw "not implemented"
				debugger;
				/*
				p = getPage(srcPageId & 3);
				q = getPage(dstPageId);
				if (vscroll >= -199 && vscroll <= 199) {
					uint16_t h = 200;
					if (vscroll < 0) {
						h += vscroll;
						p += -vscroll * 160;
					} else {
						h -= vscroll;
						q += vscroll * 160;
					}a
					memcpy(q, p, h * 160);
				}
				*/
			}
		}



		copyPage2(src) {
			//console.log("Video::copyPage()");
			/*
			uint8_t *dst = _pages[0];
			int h = 200;
			while (h--) {
				int w = 40;
				while (w--) {
					uint8_t p[] = {
						*(src + 8000 * 3),
						*(src + 8000 * 2),
						*(src + 8000 * 1),
						*(src + 8000 * 0)
					};
					for(int j = 0; j < 4; ++j) {
						uint8_t acc = 0;
						for (int i = 0; i < 8; ++i) {
							acc <<= 1;
							acc |= (p[i & 3] & 0x80) ? 1 : 0;
							p[i & 3] <<= 1;
						}
						*dst++ = acc;
					}
					++src;
				}
			}
		*/

		}

		/*
		Note: The palettes set used to be allocated on the stack but I moved it to
			  the heap so I could dump the four framebuffer and follow how
			  frames are generated.
		*/
		changePal(palNum) {

			if (palNum >= 32)
				return;
			/*
			uint8_t *p = this.res.segPalettes + palNum * 32; //colors are coded on 2bytes (565) for 16 colors = 32
			sys->setPalette(p);
			*/

			this.res.segPalettes.pos = palNum * 32

			var paletteCss = ""
			var NUM_COLORS = 16
			for (var i = 0; i < NUM_COLORS; ++i) {
				var c1 = this.res.segPalettes.readByte();
				var c2 = this.res.segPalettes.readByte();
				var r = (((c1 & 0x0F) << 2) | ((c1 & 0x0F) >> 2)) << 2; // r
				var g = (((c2 & 0xF0) >> 2) | ((c2 & 0xF0) >> 6)) << 2; // g
				var b = (((c2 & 0x0F) >> 2) | ((c2 & 0x0F) << 2)) << 2; // b
				paletteCss += `.color${i} {background: rgb(${r}, ${g}, ${b})}\r\n`
			}
			document.getElementById("palette").innerHTML = paletteCss;
			/*
			var css = document.getElementById("palette");
			if ( css){
				css.remove();
			}
			css = document.createElement("style");
			css.id = "palette";
			css.innerHTML = paletteCss;
			document.getElementsByTagName("header")[0].append(css);
			this.currentPaletteId = palNum;
			*/
		}

		updateDisplay(pageId) {

			//console.log(`Video::updateDisplay(${pageId})`);
			if (pageId != 0xFE) {
				if (pageId == 0xFF) {
					var t = this._curPagePtr2
					this._curPagePtr3 = this._curPagePtr2;
					this._curPagePtr2 = t;
				} else {
					this._curPagePtr2 = this.getPage(pageId);
				}
			}

			//Check if we need to change the palette
			if (this.paletteIdRequested != NO_PALETTE_CHANGE_REQUESTED) {
				this.changePal(this.paletteIdRequested);
				this.paletteIdRequested = NO_PALETTE_CHANGE_REQUESTED;
			}

			var dst = document.getElementById("currentScreen");

			var clone = this._curPagePtr2.cloneNode(true);
			dst.textContent = '';
			dst.append(...clone.children);

			/*
				
			
				//Q: Why 160 ?
				//A: Because one byte gives two palette indices so
				//   we only need to move 320/2 per line.
			  sys->updateDisplay(_curPagePtr2);
			  */
		}

		/*
		void Video::saveOrLoad(Serializer &ser) {
			uint8_t mask = 0;
			if (ser._mode == Serializer::SM_SAVE) {
				for (int i = 0; i < 4; ++i) {
					if (_pages[i] == _curPagePtr1)
						mask |= i << 4;
					if (_pages[i] == _curPagePtr2)
						mask |= i << 2;
					if (_pages[i] == _curPagePtr3)
						mask |= i << 0;
				}		
			}
			Serializer::Entry entries[] = {
				SE_INT(&currentPaletteId, Serializer::SES_INT8, VER(1)),
				SE_INT(&paletteIdRequested, Serializer::SES_INT8, VER(1)),
				SE_INT(&mask, Serializer::SES_INT8, VER(1)),
				SE_ARRAY(_pages[0], Video::VID_PAGE_SIZE, Serializer::SES_INT8, VER(1)),
				SE_ARRAY(_pages[1], Video::VID_PAGE_SIZE, Serializer::SES_INT8, VER(1)),
				SE_ARRAY(_pages[2], Video::VID_PAGE_SIZE, Serializer::SES_INT8, VER(1)),
				SE_ARRAY(_pages[3], Video::VID_PAGE_SIZE, Serializer::SES_INT8, VER(1)),
				SE_END()
			};
			ser.saveOrLoadEntries(entries);
		
			if (ser._mode == Serializer::SM_LOAD) {
				_curPagePtr1 = _pages[(mask >> 4) & 0x3];
				_curPagePtr2 = _pages[(mask >> 2) & 0x3];
				_curPagePtr3 = _pages[(mask >> 0) & 0x3];
				changePal(currentPaletteId);
			}
		}
		*/


	}
});

