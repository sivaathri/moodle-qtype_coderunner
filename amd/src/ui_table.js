// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more util.details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Implementation of the table_ui user interface plugin. For overall details
 * of the UI plugin architecture, see userinterfacewrapper.js.
 *
 * This plugin replaces the usual textarea answer element with a div
 * containing an HTML table. The number of columns, and
 * the initial number of rows are specified by required template parameters
 * table_num_columns and table_num_rows respectively.
 * Optional additional template parameters are:
 *   1. table_column_headers: a list of strings that can be used to provide a
 *      fixed header row at the top.
 *   2. table_row_labels: a list of strings that can be used to provide a
 *      fixed row label column at the left.
 *   3. table_dynamic_rows, which, if true, allows the user to add rows.
 *   4. table_locked_cells: a list of [row, column] pairs, being the coordinates
 *      of table cells that cannot be changed by the user.
 *   5. table_column_width_percents: a list of the percentages of the width occupied
 *      by each column. This list must include a value for the row labels, if present.
 *
 * The serialisation of the table, which is what is essentially copied back
 * into the textarea for submissions as the answer, is a JSON array. Each
 * element in the array is itself an array containing the values of one row
 * of the table. Empty cells are empty strings. The table header row and row
 * label columns are not provided in the serialisation.
 *
 * To preload the table with data, simply set the answer_preload of the question
 * to a json array of row values (each itself an array). If the number of rows
 * in the preload exceeds the number set by table_num_rows, extra rows are
 * added. If the number is less than table_num_rows, or if there is no
 * answer preload, undefined rows are simply left blank.
 *
 * As a special case of the serialisation, if all cells in the serialisation
 * are empty strings, the serialisation is itself the empty string.
 *
 * @package    qtype
 * @subpackage coderunner
 * @copyright  Richard Lobb, 2018, The University of Canterbury
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function($) {

    function TableUi(textareaId, width, height, templateParams) {
        this.textArea = $(document.getElementById(textareaId));
        this.readOnly = this.textArea.prop('readonly');
        this.templateParams = templateParams;
        this.tableDiv = null;
        this.fail = false;
        if (templateParams.table_locked_cells) {
            this.lockedCells = templateParams.table_locked_cells;
        } else {
            this.lockedCells = [];
        }
        this.hasHeader = templateParams.hasOwnProperty('table_num_columns');
        this.hasRowLabels = templateParams.hasOwnProperty('table_row_labels');
        if (!templateParams.table_num_columns ||
            !templateParams.table_num_rows) {
            this.fail = true;
            this.failString = 'table_ui_missingparams';
        } else {
            this.reload();
        }
    }

    TableUi.prototype.isLockedCell = function(row, col) {
        var actualCol = this.hasRowLabels ? col - 1 : col;
        for (var i = 0; i < this.lockedCells.length; i++) {
            if (this.lockedCells[i][0] == row && this.lockedCells[i][1] == actualCol) {
                return true;
            }
        }
        return false;
    };

    TableUi.prototype.getElement = function() {
        return this.tableDiv;
    };

    TableUi.prototype.failed = function() {
        return this.fail;
    };

    TableUi.prototype.failMessage = function() {
        return this.failString;
    };


   // Copy the serialised version of the Table UI area to the TextArea.
    TableUi.prototype.sync = function() {
        var
            serialisation = [],
            empty = true,
            tableRows = $(this.tableDiv).find('table tbody tr');


        tableRows.each(function () {
            var rowValues = [];
            $(this).find('textarea').each(function () {
                var cellVal = $(this).val();
                rowValues.push(cellVal);
                if (cellVal) {
                    empty = false;
                }
            });
            serialisation.push(rowValues);
        });

        if (empty) {
            this.textArea.val('');
        } else {
            this.textArea.val(JSON.stringify(serialisation));
        }
    };


    // Build the HTML table, filling it with the data from the serialisation
    // currently in the textarea (if there is any).
    TableUi.prototype.reload = function() {
        var
            preloadJson = $(this.textArea).val(), // JSON-encoded table values
            preload = [],
            divHtml = "<div style='height:fit-content' class='qtype-coderunner-table-outer-div'>\n" +
                      "<table class='table table-bordered qtype-coderunner_table'>\n",
            colWidthPercents = this.templateParams.table_column_width_percents,
            rowLabels = this.hasRowLabels ? this.templateParams.table_row_labels : [],
            header,
            width,
            iCol,
            nCols = this.templateParams.table_num_columns + (this.hasRowLabels ? 1 : 0),
            defaultWidth = Math.trunc(100 / nCols);

        if (preloadJson) {
            try {
                preload = JSON.parse(preloadJson);
            } catch(error)  {
                this.fail = true;
                this.failString = 'table_ui_invalidjson';
                return;
            }
        }

        try {
            // Build the table header
            divHtml += "<thead>\n";
            if (this.hasHeader) {
                divHtml += "<tr>";
                for(iCol = 0; iCol < nCols; iCol++) {
                    width = colWidthPercents ? colWidthPercents[iCol] : defaultWidth;
                    divHtml += "<th style='width:" + width.toString() + "%'>";
                    if (this.hasRowLabels) {
                        header = iCol == 0 ? '' : this.templateParams.table_column_headers[iCol - 1];
                    } else {
                        header = this.templateParams.table_column_headers[iCol];
                    }
                    divHtml += header + "</th>";
                }
                divHtml += "</tr>\n";
            }
            divHtml += "</thead>\n";

            // Build the table body. Each table cell has a textarea inside it,
            // except for row labels (if present).
            divHtml += "<tbody>\n";
            var num_rows_required = Math.max(this.templateParams.table_num_rows, preload.length);
            for (var iRow = 0; iRow < num_rows_required; iRow++) {
                divHtml += '<tr>';
                for (iCol = 0; iCol < nCols; iCol++) {
                    if (this.hasRowLabels && iCol == 0) {
                        divHtml += "<th style='padding-top:8px;text-align:center' scope='row'>";
                        if (iRow < rowLabels.length) {
                            divHtml += rowLabels[iRow];
                        }
                        divHtml += "</th>";
                    } else {
                        divHtml += "<td style='padding:2px;margin:0'>";
                        divHtml += '<textarea rows="2" style="width:100%;padding:0;resize:vertical;font-family: monospace"';
                        if (this.isLockedCell(iRow, iCol)) {
                            divHtml += ' disabled>';
                        } else {
                            divHtml += '>';
                        }
                        if (iRow < preload.length) {
                            divHtml += preload[iRow][iCol - (this.hasRowLabels ? 1 : 0)];
                        }
                        divHtml += '</textarea>';
                        divHtml += "</td>";
                    }
                }
                divHtml += '</tr>';
            }

            divHtml += '</tbody>\n</table>\n</div>';
            this.tableDiv = $(divHtml);
            if (this.templateParams.table_dynamic_rows) {
                this.addButtons();
            }
        } catch (error) {
            this.fail = true;
            this.failString = 'table_ui_invalidserialisation';
        }
    };


    // Add 'Add row' and 'Delete row' buttons at the end of the table
    TableUi.prototype.addButtons = function() {
        var deleteButtonHtml = '<button type="button"' +
                'style="float:right;margin-right:6px" disabled>Delete row</button>',
            deleteButton = $(deleteButtonHtml),
            t = this;
        this.tableDiv.append(deleteButton);
        deleteButton.click(function() {
            var numRows = t.tableDiv.find('table tbody tr').length,
                lastRow = t.tableDiv.find('tr:last');
            if (numRows > t.templateParams.table_num_rows) {
                lastRow.remove();
            }
            lastRow = t.tableDiv.find('tr:last'); // New last row
            if (numRows == t.templateParams.table_num_rows + 1) {
                $(this).prop('disabled', true);
            }
        });

        var addButtonHtml = '<button type="button"' +
                'style="float:right;margin-right:6px">Add row</button>',
            addButton = $(addButtonHtml);
        t.tableDiv.append(addButton);
        addButton.click(function() {
            var lastRow, newRow;
            lastRow = t.tableDiv.find('table tbody tr:last');
            newRow = lastRow.clone();  // Copy the last row of the table
            newRow.find('textarea').each(function() {  // Clear all td elements in it
                $(this).val('');
            });
            lastRow.after(newRow);
            $(this).prev().prop('disabled', false);
        });
    };


    TableUi.prototype.resize = function() {}; // Nothing to see here. Move along please.

    TableUi.prototype.hasFocus = function() {
        var focused = false;
        $(this.tableDiv).find('textarea').each(function() {
            if (this === document.activeElement) {
                focused = true;
            }
        });
        return focused;
    };

    // Destroy the HTML UI and serialise the result into the original text area.
    TableUi.prototype.destroy = function() {
        this.sync();
        $(this.tableDiv).remove();
        this.tableDiv = null;
    };

    return {
        Constructor: TableUi
    };
});
