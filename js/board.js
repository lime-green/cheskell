'use strict';

window.addEventListener('load', function() {
    var canvas = document.getElementById("canvas_display");
    var chess = new ChessModel();
    var view = new ViewModel({model: chess, borderSize: 5, canvas: canvas});

    canvas.addEventListener('click', function(evt) {
        view.mouseHandler(evt);
    });

    chess.addListener(function (typeString) {
        if (typeString === 'SQUARE_SELECTED' || typeString === 'SQUARE_DESELECTED' || typeString === 'BOARD_UPDATED') {
            view.drawBoardSquares();
            view.drawPieces();
        }
    });

    // setup board
    chess.parseFEN();
});

var ViewModel = function(hash) {
    this.boardModel = hash.model;
    this.canvas = hash.canvas;
    this.ctx = this.canvas.getContext('2d');

    this.borderX = hash.borderSize;
    this.borderY = hash.borderSize;

    var height = this.canvas.height;
    var width = this.canvas.width;

    //effective sizes
    this.width  = width - this.borderX*2;
    this.height = height - this.borderY*2;
    this.sliceSize = this.width/8;
};

_.extend(ViewModel.prototype, {

    mouseHandler: function(evt) {
        var that = this;
        var mousePosn = function() {
            var rect = that.canvas.getBoundingClientRect();
            return {
                x: evt.clientX - rect.left,
                y: evt.clientY - rect.top
            };
        }();

        (function selectHandler() {
            var squareName = posnToString(mousePosn);

            function posnToString() {
                var row = 9 - Math.ceil(
                    (mousePosn.y-that.borderY) / that.sliceSize);
                    var col = Math.ceil(
                        (mousePosn.x-that.borderX) / that.sliceSize);

                        var fileChar = String.fromCharCode(96+col);
                        return fileChar + row ;
            }

            if (that.boardModel.getSelected() === squareName) {
                that.boardModel.deselect();
            }
            else if (that.boardModel.hasSelected()) {
                // MAKE A MOVE
                var moveFrom = that.boardModel.getSelected();
                var moveTo   = squareName;

                console.log("attempt move from: " + moveFrom + " to: " + moveTo);
                that.makeMove(moveFrom, moveTo);
                that.boardModel.deselect();
            }
            else if (that.boardModel.getPieceAt(squareName)) {
                that.boardModel.selectSquare(squareName);
            }
        })();
    },

    makeMove: function(moveFrom, moveTo) {
        var that = this;
        if (that.boardModel.hasLock()) {
            // MOVE IN PROGRESS - GET OUT!
            return;
        }
        that.boardModel.toggleLock();

        $.post("/makemove",
               {from: moveFrom, to: moveTo, fen: that.boardModel.getFEN()})

               .then(function(data) {
                   if (data["successful"]) {
                       that.boardModel.setFEN(data["fen"]);
                       return $.post("/requestmove",
                                     {fen: that.boardModel.getFEN()},
                                     function(data) {
                                         that.boardModel.setFEN(data["fen"]);
                                     }).fail(function() {
                                         console.log("Unsuccessful ajax request: /requestmove");
                                     });
                   }
               }, function() { console.log("unsuccessful ajax: /makemove")})

               .then(function(data) {
                   that.boardModel.setFEN(data["fen"]);
               })
               .always(function() {
                   that.boardModel.toggleLock();
               });
    },

    drawBoardSquares: function() {
        var boardBorderColour = "black";
        var whiteColour = "#F0D9B5";
        var blackColour = "#B58863";
        var selectColour = "#F7EC74";

        this.drawRectangle({
            x: this.borderX, y: this.borderY,
            width: this.width, height: this.height,
            fillColour: whiteColour,
            borderColour: boardBorderColour, borderWidth: this.borderX
        });

        var selected = this.boardModel.squareToIndex(this.boardModel.getSelected());
        for (var row=0; row <= 7; row++) {
            for (var col=0; col <= 7; col++) {
                var selectFlag = false;
                if (selected.row == row && selected.col == col) {
                    selectFlag = true;
                }
                this.drawRectangle({
                    x: this.sliceSize*col+this.borderX,
                    y: this.sliceSize*row+this.borderY,
                    width: this.sliceSize, height: this.sliceSize,
                    fillColour: selectFlag ? selectColour :
                        ((row+col)%2===0)  ? whiteColour  : blackColour
                });
            }
        }
    },

    drawPieces: function() {
        var pieceCodes = {
            K: 9812, k: 9818,
            Q: 9813, q: 9819,
            R: 9814, r: 9820,
            B: 9815, b: 9821,
            N: 9816, n: 9822,
            P: 9817, p: 9823,
        };

        var that = this;
        _.each(this.boardModel.getBoardArray(), function(rowArray, row) {
            _.each(rowArray, function(piece, col) {
                drawPiece({
                    decimalCode: pieceCodes[piece],
                    x: that.sliceSize*col+that.sliceSize/2+that.borderX,
                    y: that.sliceSize*row+that.sliceSize/2+that.borderX+15,
                })
            });
        });

        function drawPiece(hash) {
            that.ctx.fillStyle = "black";
            that.ctx.textAlign = "center";
            that.ctx.font = "50px Arial";

            that.ctx.fillText(String.fromCharCode(hash.decimalCode),
                              hash.x, hash.y);
        }
    },

    drawRectangle: function(hash) {
        this.ctx.fillStyle = hash.fillColour || "white";
        this.ctx.fillRect(hash.x, hash.y, hash.width, hash.height);

        if (hash.borderWidth && hash.borderColour) {
            this.ctx.lineWidth = hash.borderWidth;
            this.ctx.strokeStyle = hash.borderColour;
            this.ctx.strokeRect(hash.x, hash.y, hash.width, hash.height);
        }
    },
});

var ChessModel = function() {
    this.listeners = [];
    this.moveHistory = [];
    this.stateString = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    this.selected = "";
    this.boardArray = [];
    this.lock = false;
};

_.extend(ChessModel.prototype, {
    addListener: function(listener) {
        this.listeners.push(listener);
    },

    hasLock: function() {
        return (this.lock === true);
    },

    toggleLock: function() {
        this.lock = !this.lock;
    },

    squareToIndex: function(squareName) {
        var rowIndex = 8 - squareName[1];
        var colIndex = squareName.charCodeAt(0)-97;
        return {
            row: rowIndex,
            col: colIndex,
        };
    },

    getPieceAt: function(squareName) {
        var indices = this.squareToIndex(squareName);
        return this.boardArray[indices.row][indices.col];
    },

    hasSelected: function() {
        return (this.getSelected() !== "");
    },

    getSelected: function() {
        return this.selected;
    },

    selectSquare: function(squareName) {
        this.selected = squareName;

        _.each(this.listeners, function(callback, index) {
            callback('SQUARE_SELECTED', squareName);
        });
    },

    deselect: function() {
        this.selected = "";

        _.each(this.listeners, function(callback, index) {
            callback('SQUARE_DESELECTED');
        });
    },

    getFEN: function() {
        return this.stateString;
    },

    setFEN: function(FEN) {
        this.stateString = FEN;
        this.parseFEN();
    },

    parseFEN: function() {
        var FENArray = this.stateString.split(" ");
        var that = this;

        this.boardArray = makeBoard(FENArray[0]);
        var toMove = FENArray[1] === "w" ? "WHITE" : "BLACK";
        var fullMoves = FENArray[5];

        function makeBoard(placementString) {
            var result = new Array([], [], [], [], [], [], [], []);
            var rows = placementString.split("/");

            _.each(rows, function(datapoint, rowIndex) {
                var colIndex = 0;
                _.each(datapoint, function(character) {
                    if (isNaN(character)) {
                        result[rowIndex][colIndex] = character;
                        colIndex++;
                    }
                    else {
                        colIndex += parseInt(character);
                    }
                });
            });
            return result;
        }

        _.each(this.listeners, function(callback, index) {
            callback('BOARD_UPDATED');
        });
    },

    getBoardArray: function() {
        return this.boardArray;
    },
});
