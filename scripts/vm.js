define(function (require, exports, module) {
    var PlayerInput = require('./playerInput')
    var sys = require('./sys')
    var Video = require('./video')
    var Point = require('./point')

    var ScriptVars = {
        VM_VARIABLE_RANDOM_SEED: 0x3C,

        VM_VARIABLE_LAST_KEYCHAR: 0xDA,

        VM_VARIABLE_HERO_POS_UP_DOWN: 0xE5,

        VM_VARIABLE_MUS_MARK: 0xF4,

        VM_VARIABLE_SCROLL_Y: 0xF9, // = 239
        VM_VARIABLE_HERO_ACTION: 0xFA,
        VM_VARIABLE_HERO_POS_JUMP_DOWN: 0xFB,
        VM_VARIABLE_HERO_POS_LEFT_RIGHT: 0xFC,
        VM_VARIABLE_HERO_POS_MASK: 0xFD,
        VM_VARIABLE_HERO_ACTION_POS_MASK: 0xFE,
        VM_VARIABLE_PAUSE_SLICES: 0xFF
    };

    module.exports = class VirtualMachine {
        constructor(resources) {
            this.res = resources;

            this.VM_NUM_THREADS = 64
            this.VM_NUM_VARIABLES = 256
            this.VM_NO_SETVEC_REQUESTED = 0xFFFF
            this.VM_INACTIVE_THREAD = 0xFFFF

            //For threadsData navigation
            this.PC_OFFSET = 0
            this.REQUESTED_PC_OFFSET = 1
            this.NUM_DATA_FIELDS = 2

            //For vmIsChannelActive navigation
            this.CURR_STATE = 0
            this.REQUESTED_STATE = 1
            this.NUM_THREAD_FIELDS = 2

            this.frequenceTable = [];

            this.vmVariables = new Array(this.VM_NUM_VARIABLES);
            this.vmVariables.fill(0);
            this._scriptStackCalls = new Array(this.VM_NUM_THREADS);
            this.threadsData = new Array(this.NUM_DATA_FIELDS);
            for (var i = 0; i < this.NUM_DATA_FIELDS; ++i) {
                this.threadsData[i] = new Array(this.VM_NUM_THREADS);
            }

            // This array is used: 
            //     0 to save the channel's instruction pointer 
            //     when the channel release control (this happens on a break).
            //     1 When a setVec is requested for the next vm frame.
            this.vmIsChannelActive = new Array(this.NUM_THREAD_FIELDS);
            for (var i = 0; i < this.NUM_THREAD_FIELDS; ++i) {
                this.vmIsChannelActive[i] = new Array(this.VM_NUM_THREADS);
            }

            this.lastTimeStamp = 0;

            this.opcodeTable = [
                /* 0x00 */
                this.op_movConst,
                this.op_mov,
                this.op_add,
                this.op_addConst,
                /* 0x04 */
                this.op_call,
                this.op_ret,
                this.op_pauseThread,
                this.op_jmp,
                /* 0x08 */
                this.op_setSetVect,
                this.op_jnz,
                this.op_condJmp,
                this.op_setPalette,
                /* 0x0C */
                this.op_resetThread,
                this.op_selectVideoPage,
                this.op_fillVideoPage,
                this.op_copyVideoPage,
                /* 0x10 */
                this.op_blitFramebuffer,
                this.op_killThread,
                this.op_drawString,
                this.op_sub,
                /* 0x14 */
                this.op_and,
                this.op_or,
                this.op_shl,
                this.op_shr,
                /* 0x18 */
                this.op_playSound,
                this.op_updateMemList,
                this.op_playMusic
            ];

            // todo: probably the wrong place for this
            this.video = new Video(this.res, this.sys);
            this.video.init();
        }

        init() {
            this.vmVariables[0x54] = 0x81;
            this.vmVariables[ScriptVars.VM_VARIABLE_RANDOM_SEED] = 0;//time(0);

            //#ifdef BYPASS_PROTECTION
            // these 3 variables are set by the game code
            this.vmVariables[0xBC] = 0x10;
            this.vmVariables[0xC6] = 0x80;
            this.vmVariables[0xF2] = 4000;
            // these 2 variables are set by the engine executable
            this.vmVariables[0xDC] = 33;
            //#endif

            //player->_markVar = &vmVariables[VM_VARIABLE_MUS_MARK];
        }

        op_movConst() {
            var variableId = this.script.readByte();
            var value = this.script.readInt16BE();
            //console.log(`op_movConst ${variableId.toString(16)} ${value}`);
            this.vmVariables[variableId] = value;
        }

        op_mov() {
            var dstVariableId = this.script.readByte();
            var srcVariableId = this.script.readByte();
            //console.log(`op_mov ${dstVariableId.toString(16)} ${srcVariableId.toString(16)}`);
            this.vmVariables[dstVariableId] = this.vmVariables[srcVariableId];
        }

        op_add() {
            var dstVariableId = script.readByte();
            var srcVariableId = script.readByte();
            //console.log(`op_add ${dstVariableId.toString(16)} ${srcVariableId.toString(16)}`);
            this.vmVariables[dstVariableId] += this.vmVariables[srcVariableId];
        }

        op_addConst() {
            /*
            if (this.res.currentPartId == 0x3E86 && this.script.pc == this.res.segBytecode + 0x6D48) {
                warning("VirtualMachine::op_addConst() hack for non-stop looping gun sound bug");
                // the script 0x27 slot 0x17 doesn't stop the gun sound from looping, I 
                // don't really know why ; for now, let's play the 'stopping sound' like 
                // the other scripts do
                //  (0x6D43) jmp(0x6CE5)
                //  (0x6D46) break
                //  (0x6D47) VAR(6) += -50
                snd_playSound(0x5B, 1, 64, 1);
            }*/
            var variableId = this.script.readByte();
            var value = this.script.readInt16BE();
            //console.log(`op_addConst(${variableId.toString(16)} ${value}`);
            this.vmVariables[variableId] += value;
        }

        op_call() {

            var offset = this.script.readUint16BE();
            var sp = this._stackPtr;
            //console.log(`op_call() offset: ${offset.toString(16)}`);
            this._scriptStackCalls[sp] = this.script.pos 
            if (this._stackPtr == 0xFF) {
                throw "op_call stack overflow"
            }
            ++this._stackPtr;
            this.script.pos = offset;
        }

        op_ret() {
            //console.log("op_ret()");
            if (this._stackPtr == 0) {
                throw "op_call stack underflow"
            }
            --this._stackPtr;
            var sp = this._stackPtr;
            this.script.pos = this._scriptStackCalls[sp];
        }

        op_pauseThread() {
            //console.log("op_pauseThread");
            this.gotoNextThread = true;
        }

        op_jmp() {
            var pcOffset = this.script.readUint16BE();
            //console.log(`op_jmp(0x${pcOffset.toString(16)})`)
            this.script.pos = pcOffset;
        }

        op_setSetVect() {
            var threadId = this.script.readByte();
            var pcOffsetRequested = this.script.readUint16BE();
            //console.log(`op_setSetVect ${threadId} ${pcOffsetRequested}`)
            this.threadsData[this.REQUESTED_PC_OFFSET][threadId] = pcOffsetRequested;
        }

        op_jnz() {
            var i = this.script.readByte();
            //console.log(`op_jnz(0x${i.toString(16)}`);
            --this.vmVariables[i];
            if (this.vmVariables[i] != 0) {
                this.op_jmp();
            } else {
                this.script.readUint16BE();
            }
        }

        op_condJmp() {
            var opcode = this.script.readByte();
            var variable = this.script.readByte();
            var b = this.vmVariables[variable];

            var a;
            if (opcode & 0x80) {
                a = this.vmVariables[this.script.readByte()];
            } else if (opcode & 0x40) {
                a = this.script.readUint16BE();
            } else {
                a = this.script.readByte();
            }
            //console.log(`op_condJmp(${opcode} ${b.toString(16)} ${a.toString(16)}`);

            // Check if the conditional value is met.
            var expr = false;
            switch (opcode & 7) {
                case 0:	// jz
                    expr = (b == a);
                    //#ifdef BYPASS_PROTECTION
                    if (this.res.currentPartId == 16000) {
                        //
                        // 0CB8: jmpIf(VAR(0x29) == VAR(0x1E), @0CD3)
                        // ...
                        //
                        if (b == 0x29 && (opcode & 0x80) != 0) {
                            // 4 symbols
                            this.vmVariables[0x29] = this.vmVariables[0x1E];
                            this.vmVariables[0x2A] = this.vmVariables[0x1F];
                            this.vmVariables[0x2B] = this.vmVariables[0x20];
                            this.vmVariables[0x2C] = this.vmVariables[0x21];
                            // counters
                            this.vmVariables[0x32] = 6;
                            this.vmVariables[0x64] = 20;
                            //warning("Script::op_condJmp() bypassing protection");
                            expr = true;
                        }
                    }
                    //#endif
                    break;
                case 1: // jnz
                    expr = (b != a);
                    break;
                case 2: // jg
                    expr = (b > a);
                    break;
                case 3: // jge
                    expr = (b >= a);
                    break;
                case 4: // jl
                    expr = (b < a);
                    break;
                case 5: // jle
                    expr = (b <= a);
                    break;
                default:
                    //warning("VirtualMachine::op_condJmp() invalid condition %d", (opcode & 7));
                    break;
            }

            if (expr) {
                this.op_jmp();
            } else {
                this.script.readUint16BE();
            }

        }

        op_setPalette() {
            var paletteId = this.script.readUint16BE();
            //console.log(`op_changePalette(${paletteId}`);
            this.video.paletteIdRequested = paletteId >> 8;
        }

        op_resetThread() {

            var threadId = this.script.readByte();
            var i = this.script.readByte();

            // FCS: WTF, this is cryptic as hell !!
            //var n = (i & 0x3F) - threadId;  //0x3F = 0011 1111
            // The following is so much clearer

            //Make sure i within [0-VM_NUM_THREADS-1]
            i = i & (this.VM_NUM_THREADS - 1);
            var n = i - threadId;

            if (n < 0) {
                //warning("VirtualMachine::op_resetThread() ec=0x%X (n < 0)", 0x880);
                return;
            }
            ++n;
            var a = this.script.readByte();

            if (a == 2) {

                for (; n > 0; --n) {
                    this.threadsData[this.REQUESTED_PC_OFFSET][threadId + n - 1] = 0xFFFE;
                }
            } else if (a < 2) {
                for (; n > 0; --n) {
                    this.threadsData[this.REQUESTED_STATE][threadId + n - 1] = a;
                }
            }
        }

        op_selectVideoPage() {
            var frameBufferId = this.script.readByte();
            //console.log(`op_selectVideoPage: frameBufferId ${frameBufferId}`);
            this.video.changePagePtr1(frameBufferId);
        }

        op_fillVideoPage() {
            var pageId = this.script.readByte();
            var color = this.script.readByte();
            //console.log(`op_fillVideoPage: page ${pageId}, color ${color}`);
            this.video.fillPage(pageId, color);
        }

        op_copyVideoPage() {
            var srcPageId = this.script.readByte();
            var dstPageId = this.script.readByte();
            //console.log(`op_copyVideoPage(${srcPageId}, ${dstPageId})`);
            this.video.copyPage(srcPageId, dstPageId, this.vmVariables[ScriptVars.VM_VARIABLE_SCROLL_Y]);
        }

        op_blitFramebuffer() {

            var pageId = this.script.readByte();
            //inp_handleSpecialKeys();

            var now = sys.getTimeStamp();
            var delay = now - this.lastTimeStamp;
            var timeToSleep = this.vmVariables[ScriptVars.VM_VARIABLE_PAUSE_SLICES] * 20 - delay;

            //console.log(`op_blitFramebuffer: pageId: ${pageId}, timeToSleep: ${timeToSleep}`);

            // The bytecode will set vmVariables[VM_VARIABLE_PAUSE_SLICES] from 1 to 5
            // The virtual machine hence indicate how long the image should be displayed.

            if (timeToSleep > 0) {
                // ugh not sure how to do this without a busy wait
                while ((now + timeToSleep) > sys.getTimeStamp()) {
                    //console.log(`sleeping until ${(now + timeToSleep)} now ${sys.getTimeStamp()}`)
                }
                //sys.sleep(timeToSleep);
            }

            this.lastTimeStamp = sys.getTimeStamp();

            //WTF ?
            this.vmVariables[0xF7] = 0;

            this.video.updateDisplay(pageId);
        }

        op_killThread() {
            //console.log("op_killThread");
            this.script.pos = 0xFFFF;
            this.gotoNextThread = true;
        }

        op_drawString() {
            var stringId = this.script.readUint16BE();
            var x = this.script.readByte();
            var y = this.script.readByte();
            var color = this.script.readByte();

            this.video.drawString(color, x, y, stringId);
        }

        op_sub() {
            var i = this.script.readByte();
            var j = this.script.readByte();
            this.vmVariables[i] -= vmVariables[j];
        }

        op_and() {
            var variableId = this.script.readByte();
            var n = this.script.readUint16BE();
            this.vmVariables[variableId] = this.vmVariables[variableId] & n;
        }

        op_or() {
            var variableId = this.script.readByte();
            var value = this.script.readUint16BE();
            this.vmVariables[variableId] = this.vmVariables[variableId] | value;
        }

        op_shl() {
            var variableId = this.script.readByte();
            var leftShiftValue = this.script.readUint16BE();
            //debug(DBG_VM, "VirtualMachine::op_shl(0x%02X, %d)", variableId, leftShiftValue);
            vmVariables[variableId] = this.vmVariables[variableId] << leftShiftValue;
        }

        op_shr() {
            var variableId = this.script.readByte();
            var rightShiftValue = this.script.readUint16BE();
            vmVariables[variableId] = this.vmVariables[variableId] >> rightShiftValue;
        }

        op_playSound() {
            var resourceId = this.script.readUint16BE();
            var freq = this.script.readByte();
            var vol = this.script.readByte();
            var channel = this.script.readByte();
            //console.log(`op_playSound ${resourceId} ${freq} ${vol} ${channel}`);
            //snd_playSound(resourceId, freq, vol, channel);
        }

        op_updateMemList() {

            var resourceId = this.script.readUint16BE();

            //console.log(`op_updateMemList resourceId ${resourceId}`);

            if (resourceId == 0) {
                //player->stop();
                //mixer->stopAll();
                //this.res.invalidateRes();
            } else {
                this.res.loadPartsOrMemoryEntry(resourceId);
            }
        }

        op_playMusic() {
            var resNum = this.script.readUint16BE();
            var delay = this.script.readUint16BE();
            var pos = this.script.readByte();
            //console.log(`op_playMusic ${resNum} ${delay} ${pos}`);
            //snd_playMusic(resNum, delay, pos);
        }

        initForPart(partId) {

            //player->stop();
            //mixer->stopAll();

            //WTF is that ?
            this.vmVariables[0xE4] = 0x14;

            this.res.setupPart(partId);

            //Set all thread to inactive (pc at 0xFFFF or 0xFFFE )    
            this.threadsData.forEach(e => e.fill(0xFFFF));

            this.vmIsChannelActive.forEach(e => e.fill(0));

            var firstThreadId = 0;
            this.threadsData[this.PC_OFFSET][firstThreadId] = 0;
        }

        /* 
             This is called every frames in the infinite loop.
        */
        checkThreadRequests() {

            //Check if a part switch has been requested.
            if (this.res.requestedNextPart > 0) {
                this.initForPart(this.res.requestedNextPart);
                this.res.requestedNextPart = 0;
            }


            // Check if a state update has been requested for any thread during the previous VM execution:
            //      - Pause
            //      - Jump

            // JUMP:
            // Note: If a jump has been requested, the jump destination is stored
            // in threadsData[REQUESTED_PC_OFFSET]. Otherwise threadsData[REQUESTED_PC_OFFSET] == 0xFFFF

            // PAUSE:
            // Note: If a pause has been requested it is stored in  vmIsChannelActive[REQUESTED_STATE][i]

            for (var threadId = 0; threadId < this.VM_NUM_THREADS; threadId++) {

                this.vmIsChannelActive[this.CURR_STATE][threadId] = this.vmIsChannelActive[this.REQUESTED_STATE][threadId];

                var n = this.threadsData[this.REQUESTED_PC_OFFSET][threadId];

                if (n != this.VM_NO_SETVEC_REQUESTED) {

                    this.threadsData[this.PC_OFFSET][threadId] = (n == 0xFFFE) ? this.VM_INACTIVE_THREAD : n;
                    this.threadsData[this.REQUESTED_PC_OFFSET][threadId] = this.VM_NO_SETVEC_REQUESTED;
                }
            }
        }

        hostFrame() {

            var executed = false

            // Run the Virtual Machine for every active threads (one vm frame).
            // Inactive threads are marked with a thread instruction pointer set to 0xFFFF (VM_INACTIVE_THREAD).
            // A thread must feature a break opcode so the interpreter can move to the next thread.

            for (var threadId = 0; threadId < this.VM_NUM_THREADS; threadId++) {

                if (this.vmIsChannelActive[this.CURR_STATE][threadId] != 0)
                    continue;

                var n = this.threadsData[this.PC_OFFSET][threadId];

                if (n != this.VM_INACTIVE_THREAD) {

                    // Set the script pointer to the right location.
                    // script pc is used in executeThread in order
                    // to get the next opcode.
                    this.script = this.res.segBytecode;
                    this.script.pos = n;
                    this._stackPtr = 0;

                    this.gotoNextThread = false;
                    //console.log(`hostFrame() i=0x${threadId.toString(16)} n=0x${n.toString(16)} *p=0x${this.script.byteArray[this.script.pos].toString(16)}`);
                    executed = this.executeThread() || executed;

                    //Since .pc is going to be modified by this next loop iteration, we need to save it.
                    this.threadsData[this.PC_OFFSET][threadId] = this.script.pos;

                    //console.log(`hostFrame() i=0x${threadId.toString(16)} pos=0x${this.threadsData[this.PC_OFFSET][threadId].toString(16)}`);
                    //debug(DBG_VM, "VirtualMachine::hostFrame() i=0x%02X pos=0x%X", threadId, threadsData[PC_OFFSET][threadId]);
                    //if (this.sys.input.quit) {
                    //    break;
                    //}
                }

            }

            return executed;
        }


        executeThread() {

            const COLOR_BLACK = 0xFF
            const DEFAULT_ZOOM = 0x40
            var executed = false;

            while (!this.gotoNextThread) {
                executed = true;

                var opcode = this.script.readByte();
                if (opcode === undefined) {
                    throw "undefined opcode";
                }

                // 1000 0000 is set
                if ((opcode & 0x80) > 0) {
                    var off = (((opcode << 8) | this.script.readByte()) * 2) & 0xffff;
                    this.res._useSegVideo2 = false;
                    var x = this.script.readByte();
                    var y = this.script.readByte();
                    var h = y - 199;
                    if (h > 0) {
                        y = 199;
                        x += h;
                    }
                    //console.log(`vid_opcd_0x80 : opcode=${opcode} off=${off} x=${x} y=${y}`);

                    // This switch the polygon database to "cinematic" and probably draws a black polygon
                    // over all the screen.
                    this.video.setDataBuffer(this.res.segCinematic, off);
                    this.video.readAndDrawPolygon(COLOR_BLACK, DEFAULT_ZOOM, new Point(x, y));

                    continue;
                }

                // 0100 0000 is set
                if ((opcode & 0x40) > 0) {
                    var x, y;
                    var off = this.script.readUint16BE() * 2;
                    x = this.script.readByte();

                    this.res._useSegVideo2 = false;

                    if ((opcode & 0x20) == 0) {
                        if ((opcode & 0x10) == 0)  // 0001 0000 is set
                        {
                            x = (x << 8) | this.script.readByte();
                            if (x & 0x8000) {
                                x -= (1 << 16);
                            }
                        } else {
                            x = this.vmVariables[x];
                        }
                    }
                    else {
                        if ((opcode & 0x10) > 0) { // 0001 0000 is set
                            x += 0x100;
                        }
                    }

                    y = this.script.readByte();

                    if ((opcode & 8) == 0)  // 0000 1000 is set
                    {
                        if ((opcode & 4) == 0) { // 0000 0100 is set
                            y = (y << 8) | this.script.readByte();
                            if (y & 0x8000) {
                                y -= (1 << 16);
                            }
                        } else {
                            y = this.vmVariables[y];
                        }
                    }

                    var zoom = this.script.readByte();

                    if ((opcode & 2) == 0)  // 0000 0010 is set
                    {
                        if ((opcode & 1) == 0) // 0000 0001 is set
                        {
                            --this.script.pos;
                            zoom = 0x40;
                        }
                        else {
                            zoom = this.vmVariables[zoom];
                        }
                    }
                    else {

                        if ((opcode & 1) > 0) { // 0000 0001 is set
                            this.res._useSegVideo2 = true;
                            --this.script.pos;
                            zoom = 0x40;
                        }
                    }
                    //console.log(`vid_opcd_0x40 : off=${off} x=${x} y=${y}`);
                    this.video.setDataBuffer(this.res._useSegVideo2 ? this.res._segVideo2 : this.res.segCinematic, off);

                    this.video.readAndDrawPolygon(0xFF, zoom, new Point(x, y));

                    continue;
                }


                if (opcode > 0x1A) {
                    throw "executeThread invalid opcode"
                }
                else {
                    this.opcodeTable[opcode].call(this);
                }

            }

            return executed;
        }

        inp_updatePlayer() {

            throw "Not implemented"
            debugger;

            // Started converting to JS, but hasnt been tested

            this.sys.processEvents();

            if (this.res.currentPartId == 0x3E89) {
                var c = this.sys.input.lastChar;
                if (c == 8 || /*c == 0xD |*/ c == 0 || (c >= 'a' && c <= 'z')) {
                    this.vmVariables[ScriptVars.VM_VARIABLE_LAST_KEYCHAR] = c & ~0x20;
                    this.sys.input.lastChar = 0;
                }
            }

            var lr = 0;
            var m = 0;
            var ud = 0;

            if (this.sys.input.dirMask & PlayerInput.DIR_RIGHT) {
                lr = 1;
                m |= 1;
            }
            if (this.sys.input.dirMask & PlayerInput.DIR_LEFT) {
                lr = -1;
                m |= 2;
            }
            if (this.sys.input.dirMask & PlayerInput.DIR_DOWN) {
                ud = 1;
                m |= 4;
            }

            vmVariables[VM_VARIABLE_HERO_POS_UP_DOWN] = ud;

            if (this.sys.input.dirMask & PlayerInput.DIR_UP) {
                this.vmVariables[ScriptVars.VM_VARIABLE_HERO_POS_UP_DOWN] = -1;
            }

            if (this.sys.input.dirMask & PlayerInput.DIR_UP) { // inpJump
                ud = -1;
                m |= 8;
            }

            this.vmVariables[ScriptVars.VM_VARIABLE_HERO_POS_JUMP_DOWN] = ud;
            this.vmVariables[ScriptVars.VM_VARIABLE_HERO_POS_LEFT_RIGHT] = lr;
            this.vmVariables[ScriptVars.VM_VARIABLE_HERO_POS_MASK] = m;
            var button = 0;

            if (this.sys.input.button) { // inpButton
                button = 1;
                m |= 0x80;
            }

            vmVariables[VM_VARIABLE_HERO_ACTION] = button;
            vmVariables[VM_VARIABLE_HERO_ACTION_POS_MASK] = m;
        }

        inp_handleSpecialKeys() {

            throw "Not implemented"
            debugger;

            // Started converting to JS, but hasnt been tested

            if (this.sys.input.pause) {

                if (this.res.currentPartId != GAME_PART1 && this.res.currentPartId != GAME_PART2) {
                    this.sys.input.pause = false;
                    while (!this.sys.input.pause) {
                        this.sys.processEvents();
                        this.sys.sleep(200);
                    }
                }
                this.sys.input.pause = false;
            }

            if (this.sys.input.code) {
                this.sys.input.code = false;
                if (this.res.currentPartId != GAME_PART_LAST && this.res.currentPartId != GAME_PART_FIRST) {
                    this.res.requestedNextPart = GAME_PART_LAST;
                }
            }

            // XXX
            if (this.vmVariables[0xC9] == 1) {
                //warning("VirtualMachine::inp_handleSpecialKeys() unhandled case (vmVariables[0xC9] == 1)");
            }

        }
    }

});
