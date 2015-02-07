/*jslint browser: true*/
/*jslint nomen: true*/
/*global $, jQuery, alert, console*/
'use strict';

window.addEventListener('load', function () {
    var canvas = document.getElementById("canvas_display"),
        game_alert = document.getElementById("game_alert"),
        newGameButton = document.getElementById("new_game_button"),
        chess = new ChessModel(),
        view = new ViewModel({model: chess, borderSize: 5, canvas: canvas}),
        FEN_text = document.getElementById("FEN_text"),
        FEN_submit = document.getElementById("FEN_submit");

    canvas.addEventListener('click', function (evt) {
        view.mouseHandler(evt);
    });

    newGameButton.addEventListener('click', function () {
        chess.newGame();
    });

    FEN_submit.addEventListener('click', function () {
        chess.newGame();
        chess.setFEN(FEN_text.value);
    });

    chess.addListener(function (typeString, hash) {
        if (typeString === 'SQUARE_SELECTED' || typeString === 'SQUARE_DESELECTED' || typeString === 'BOARD_UPDATED') {
            view.drawBoardSquares();
            view.drawPieces();
        } else if (typeString === 'ADD_MOVE_HISTORY') {
            view.addMoveToTable(hash);
        } else if (typeString === 'CLEAR_MOVE_HISTORY') {
            view.clearTable();
        }
    });

    // setup board
    game_alert.style.display = "none";
    chess.newGame();
});

var ViewModel = function (hash) {
    this.boardModel = hash.model;
    this.canvas = hash.canvas;
    this.ctx = this.canvas.getContext('2d');

    this.borderX = hash.borderSize;
    this.borderY = hash.borderSize;

    var height = this.canvas.height, width = this.canvas.width;

    //effective sizes
    this.width  = width - this.borderX * 2;
    this.height = height - this.borderY * 2;
    this.sliceSize = this.width / 8;
};

_.extend(ViewModel.prototype, {

    clearTable: function (hash) {
        $("#move_history_table > tbody").html("");
    },

    addMoveToTable: function (hash) {
        var table  = document.getElementById("move_history_table"),
            tbody  = table.getElementsByTagName("tbody")[0],
            rowNum = Math.ceil(hash.halfMoves / 2),
            colNum = 2 - hash.halfMoves % 2,
            row,
            cell;

        if (colNum === 1) {
            row            = tbody.insertRow();
            cell           = row.insertCell(0);
            cell.innerHTML = rowNum + ". ";
            cell           = row.insertCell(1);
            row.insertCell(2);
        } else {
            row = table.rows[table.rows.length - 1];
            cell = row.cells[2];
        }

        cell.innerHTML = hash.moveFrom + "-" + hash.moveTo;
    },

    mouseHandler: function (evt) {
        var that = this, mousePosn = (function () {
            var rect = that.canvas.getBoundingClientRect();
            return {
                x: evt.clientX - rect.left,
                y: evt.clientY - rect.top
            };
        }());

        (function selectHandler() {
            var squareName = (function posnToString() {
                var row = 9 - Math.ceil((mousePosn.y - that.borderY) / that.sliceSize),
                    col = Math.ceil((mousePosn.x - that.borderX) / that.sliceSize),
                    fileChar = String.fromCharCode(96 + col);

                return fileChar + row;
            }()),
                moveFrom,
                moveTo;

            if (that.boardModel.getSelected() === squareName) {
                that.boardModel.deselect();

            } else if (that.boardModel.hasSelected()) {
                // MAKE A MOVE
                moveFrom = that.boardModel.getSelected();
                moveTo   = squareName;

                console.log("attempt move from: " + moveFrom + " to: " + moveTo);
                that.makeMove(moveFrom, moveTo);
                that.boardModel.deselect();

            } else if (that.boardModel.getPieceAt(squareName)) {
                that.boardModel.selectSquare(squareName);
            }
        }());
    },

    addGameOver: function () {
        // Use as addGameOver().create()
        // then   addGameOver().destroy()

        var gameOver = document.getElementsByClassName("alert alert-danger")[0] || document.createElement("div"),
            loading_div = document.getElementById("loading_div");

        gameOver.className = "alert alert-danger";

        return {
            create: function (text) {
                gameOver.innerHTML = text;
                loading_div.appendChild(gameOver);
            },
            destroy: function () {
                while (loading_div.firstChild) {
                    loading_div.removeChild(loading_div.firstChild);
                }
            }
        };
    },

    addSpinner: function () {
        var spinner = document.createElement("div"),
            loading_div = document.getElementById("loading_div");

        spinner.className = "spinner";

        return {
            create: function () {
                loading_div.appendChild(document.createTextNode("Thinking..."));
                loading_div.appendChild(spinner);
            },
            destroy: function () {
                while (loading_div.firstChild) {
                    loading_div.removeChild(loading_div.firstChild);
                }
            }
        };
    },

    makeMove: function (moveFrom, moveTo) {
        var that = this;
        if (that.boardModel.hasLock()) {
            // MOVE IN PROGRESS - GET OUT!
            return;
        }
        var spinner = this.addSpinner();
        spinner.create();
        that.boardModel.toggleLock();

        function registerMove(data) {
            that.boardModel.addMoveToHistory({from: data.from, to: data.to, fen: data.fen});
            that.boardModel.setFEN(data.fen);
        }

        function gameOver(alertMessage) {
            var newGameButton = document.getElementById("new_game_button");
            newGameButton.style.display = "block";
            newGameButton.innerHTML = alertMessage;
        }

        $.post("/makemove",
               {from: moveFrom, to: moveTo, fen: that.boardModel.getFEN()})

               .then(function (data) {

                if (data.successful) {
                    switch (data.result) {
                    case "1-0":
                        registerMove(data);
                        return $.Deferred().resolve("White wins!");
                    case "0-1":
                        registerMove(data);
                        return $.Deferred().resolve("Black wins!");
                    case "1/2-1/2":
                        registerMove(data);
                        return $.Deferred().resolve("Draw!");
                    default:
                        registerMove(data);
                        return $.post("/requestmove", {fen: that.boardModel.getFEN()});
                    }
                }
                return $.Deferred().reject();

            }, function () {
                console.log("unsuccessful ajax: /makemove");
            })
               .then(function (data) {
                if (typeof data !== 'string') {
                    var resultText;

                    switch (data.result) {
                    case "1-0":
                        resultText = resultText || "White wins!";
                    case "0-1":
                        resultText = resultText || "Black wins!";
                    case "1/2-1/2":
                        resultText = resultText || "Draw!";
                        alert(data);
                        registerMove(data);
                        that.addGameOver().create(resultText);
                        return;
                    }
                    registerMove(data);
                    that.boardModel.toggleLock();
                } else {
                    // white causes game to end
                    // move has already been registered
                    alert(data);
                    that.addGameOver().create(data);
                }
            }, function () {
                that.boardModel.toggleLock();
            }).always(function () {
                spinner.destroy();
            });
    },

    drawBoardSquares: function () {
        var boardBorderColour = "black",
            whiteColour = "#F0D9B5",
            blackColour = "#B58863",
            selectColour = "#F7EC74",
            selected = this.boardModel.squareToIndex(this.boardModel.getSelected()),
            moveHistory = this.boardModel.getMoveHistory(),
            row,
            col,
            selectFlag,
            moveFlag;

        this.drawRectangle({
            x: this.borderX,
            y: this.borderY,
            width: this.width,
            height: this.height,
            fillColour: whiteColour,
            borderColour: boardBorderColour,
            borderWidth: this.borderX
        });

        for (row = 0; row <= 7; row += 1) {
            for (col = 0; col <= 7; col += 1) {
                selectFlag = false;
                moveFlag   = false;

                if (selected.row === row && selected.col === col) {
                    selectFlag = true;
                }

                if (moveHistory !== 'undefined' && moveHistory.length > 0) {
                    var lastMove = moveHistory.slice(-1)[0],
                        from = this.boardModel.squareToIndex(lastMove.moveFrom),
                        to = this.boardModel.squareToIndex(lastMove.moveTo);

                    if ((from.row === row && from.col === col) || (to.row === row && to.col === col)) {
                        moveFlag = true;
                    }
                }

                this.drawRectangle({
                    x: this.sliceSize * col + this.borderX,
                    y: this.sliceSize * row + this.borderY,
                    width: this.sliceSize,
                    height: this.sliceSize,
                    fillColour: ((row + col) % 2 === 0)  ? ((moveFlag || selectFlag) ? selectColour : whiteColour)  :
                            ((moveFlag || selectFlag) ? "#DAC34A" : blackColour)
                });
            }
        }

    },

    drawPieces: function () {
        var pieceCodes = {
            K: 9812,
            k: 9818,
            Q: 9813,
            q: 9819,
            R: 9814,
            r: 9820,
            B: 9815,
            b: 9821,
            N: 9816,
            n: 9822,
            P: 9817,
            p: 9823
        },
            that = this;

        function drawPiece(hash) {
            that.ctx.fillStyle = "black";
            that.ctx.textAlign = "center";
            that.ctx.font = "50px Arial";

            that.ctx.fillText(String.fromCharCode(hash.decimalCode),
                              hash.x, hash.y);
        }

        _.each(this.boardModel.getBoardArray(), function (rowArray, row) {
            _.each(rowArray, function (piece, col) {
                drawPiece({
                    decimalCode: pieceCodes[piece],
                    x: that.sliceSize * col + that.sliceSize / 2 + that.borderX,
                    y: that.sliceSize * row + that.sliceSize / 2 + that.borderX + 15
                });
            });
        });
    },

    drawRectangle: function (hash) {
        this.ctx.fillStyle = hash.fillColour || "white";
        this.ctx.fillRect(hash.x, hash.y, hash.width, hash.height);

        if (hash.borderWidth && hash.borderColour) {
            this.ctx.lineWidth = hash.borderWidth;
            this.ctx.strokeStyle = hash.borderColour;
            this.ctx.strokeRect(hash.x, hash.y, hash.width, hash.height);
        }
    }
});

var ChessModel = function () {
    this.listeners = [];
};

_.extend(ChessModel.prototype, {
    newGame: function () {
        this.stateString = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        this.selected = "";
        this.boardArray = [];
        this.lock = false;
        this.halfMoves = 0;

        this.clearMoveHistory();
        this.parseFEN();
    },

    addListener: function (listener) {
        this.listeners.push(listener);
    },

    notifyListeners: function (eventString, moreHash) {
        _.each(this.listeners, function (callback, index) {
            callback(eventString, moreHash);
        });
    },

    clearMoveHistory: function () {
        this.moveHistory = [];
        this.notifyListeners('CLEAR_MOVE_HISTORY');
    },

    addMoveToHistory: function (hash) {
        this.moveHistory.push(
            {
                moveFrom: hash.from,
                moveTo: hash.to,
                fen: hash.fen
            }
        );
        this.halfMoves += 1;
        this.notifyListeners('ADD_MOVE_HISTORY',
                             {moveFrom: hash.from, moveTo: hash.to, halfMoves: this.halfMoves});
    },

    getMoveHistory: function () {
        return this.moveHistory;
    },

    hasLock: function () {
        return (this.lock === true);
    },

    toggleLock: function () {
        this.lock = !this.lock;
    },

    squareToIndex: function (squareName) {
        var rowIndex = 8 - squareName[1],
            colIndex = squareName.charCodeAt(0) - 97;
        return {
            row: rowIndex,
            col: colIndex
        };
    },

    getPieceAt: function (squareName) {
        var indices = this.squareToIndex(squareName);
        return this.boardArray[indices.row][indices.col];
    },

    hasSelected: function () {
        return (this.getSelected() !== "");
    },

    getSelected: function () {
        return this.selected;
    },

    selectSquare: function (squareName) {
        this.selected = squareName;
        this.notifyListeners('SQUARE_SELECTED');
    },

    deselect: function () {
        this.selected = "";
        this.notifyListeners('SQUARE_DESELECTED');
    },

    getFEN: function () {
        return this.stateString;
    },

    setFEN: function (FEN) {
        this.stateString = FEN;
        this.parseFEN();
    },

    parseFEN: function () {
        var FENArray = this.stateString.split(" "),
            that = this,
            toMove = FENArray[1] === "w" ? "WHITE" : "BLACK",
            fullMoves = FENArray[5];

        this.boardArray = (function makeBoard(placementString) {
            var result = [[], [], [], [], [], [], [], []],
                rows = placementString.split("/");

            _.each(rows, function (datapoint, rowIndex) {
                var colIndex = 0;
                _.each(datapoint, function (character) {
                    if (isNaN(character)) {
                        result[rowIndex][colIndex] = character;
                        colIndex += 1;
                    } else {
                        colIndex += parseInt(character, 10);
                    }
                });
            });
            return result;
        }(FENArray[0]));

        this.notifyListeners('BOARD_UPDATED');
    },

    getBoardArray: function () {
        return this.boardArray;
    }
});
