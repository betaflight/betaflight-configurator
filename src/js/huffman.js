'use strict';

const HUFFMAN_EOF = -1;

function huffmanDecodeBuf(inBuf, inBufCharacterCount, huffmanTree, huffmanLenIndex) {
    let code = 0;
    let codeLen = 0;
    let testBit = 0x80;
    let eof = false;
    const outBuf = [];

    while (!eof && inBuf.byteLength != 0) {
        if (outBuf.length == inBufCharacterCount) {
            // we've exhausted the input stream, discard any odd bits on the end
            break;
        }

        if (inBuf.byteLength == 0) {
            throw new Error('unexpected');
        }

        // get the next bit from the input buffer
        code <<= 1;
        ++codeLen;
        if (inBuf[0] & testBit) {
            code |= 0x01;
        }
        testBit >>= 1;
        if (testBit == 0) {
            testBit = 0x80;
            inBuf = inBuf.subarray(1);
        }

        // check if the code is a leaf node or an interior node
        if (huffmanLenIndex[codeLen] != -1) {
            // look for the code in the tree, only leaf nodes are stored in the tree
            for (let i = huffmanLenIndex[codeLen]; (i < huffmanTree.length) && (huffmanTree[i].codeLen === codeLen); ++i) {
                if (huffmanTree[i].code === code) {
                    // we've found the code, so it is a leaf node
                    const value = huffmanTree[i].value;

                    if (value == HUFFMAN_EOF) {
                        eof = true;
                    } else {
                        // output the value
                        outBuf.push(value);
                    }

                    // reset the code to continue decompressing the input buffer
                    code = 0;
                    codeLen = 0;
                    break;
                }
            }
        }
    }

    return new Uint8Array(outBuf);
}
