sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function(Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
    "use strict";
    return Controller.extend("rnow.approval.corner.controller.Main", {
        onInit: function() {
            // Initialize the main view state, route listener, and the models used across tabs.
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteMain").attachPatternMatched(this._onRouteMatched, this);
            this._sUser = "DEFAULT_USER";
            var oUser = sap.ushell && sap.ushell.Container ? sap.ushell.Container.getUser() : null;
            if (oUser && oUser.getId) {
                this._sUser = oUser.getId();
            }
            this._mTables = {
                New: "newTable",
                InProgress: "inProgressTable",
                Closed: "closedTable"
            };
            this._mEntitySets = {
                New: "RNOW_NEWSet",
                InProgress: "RNOW_INPROGRESSSet",
                Closed: "RNOW_CLOSEDSet"
            };
            this._mSearchFields = {
                New: "searchFilterNew",
                InProgress: "searchFilterInProgress",
                Closed: "searchFilterClosed"
            };
            this.REQUEST_TIMEOUT_MS = 120000;
            var oBundle = this.getView().getModel("i18n") && this.getView().getModel("i18n").getResourceBundle();
            this.getView().setModel(new JSONModel({
                pageTitle: this._sUser && oBundle ? oBundle.getText("mainPageTitleUser", [this._sUser]) : (oBundle ? oBundle.getText("mainTitle") : (this._sUser ? "Approval Corner for " + this._sUser : "Approval Corner")),
                selectedKey: "New",
                New: [],
                InProgress: [],
                Closed: [],
                NewCount: 0,
                InProgressCount: 0,
                ClosedCount: 0
            }), "main");
            this.getView().setModel(new JSONModel({
                reviewer: "",
                reason: ""
            }), "reassign");
            this._getOwnerModel().setUseBatch(false);
            this._attachTabBarFocusHandler();
            this._loadAllData();
            this._clearSelections();
        },

        _getMainModel: function() {
            return this.getView().getModel("main");
        },

        _getReassignModel: function() {
            return this.getView().getModel("reassign");
        },

        _getOwnerModel: function() {
            return this.getOwnerComponent().getModel();
        },

        _getCurrentTable: function() {
            var sKey = this._getMainModel().getProperty("/selectedKey");
            return this.byId(this._mTables[sKey]);
        },

        _getCurrentKey: function() {
            return this._getMainModel().getProperty("/selectedKey");
        },

        _getTableByKey: function(sKey) {
            return this.byId(this._mTables[sKey]);
        },

        _attachTabBarFocusHandler: function() {
            var oTabBar = this.byId("mainTabBar");
            if (oTabBar) {
                oTabBar.attachBrowserEvent("mousedown", this._preventEmptyTabBarFocus, this);
            }
        },

        _preventEmptyTabBarFocus: function(oEvent) {
            var oTarget = jQuery(oEvent.target);
            var bInTabHeader = oTarget.closest(".sapMITBHead").length > 0;
            var bOnTab = oTarget.closest(".sapMITBFilter").length > 0;
            if (bInTabHeader && !bOnTab) {
                oEvent.preventDefault();
            }
        },

        _onRouteMatched: function() {
            this._clearSelections();
            this._loadAllData();
        },

        _clearSelections: function() {
            var oTable = this._getCurrentTable();
            if (oTable) {
                oTable.clearSelection();
            }
        },

        _resetTableScroll: function(oTable) {
            if (!oTable) {
                return;
            }
            oTable.setFirstVisibleRow(0);
            var fnResetRenderedScroll = function() {
                var oTableDom = oTable.getDomRef();
                if (!oTableDom) {
                    return;
                }
                var aScrollbars = oTableDom.querySelectorAll(".sapUiTableHSb, .sapUiTableVSb");
                Array.prototype.forEach.call(aScrollbars, function(oScrollbar) {
                    oScrollbar.scrollLeft = 0;
                    oScrollbar.scrollTop = 0;
                });
            };
            fnResetRenderedScroll();
            setTimeout(fnResetRenderedScroll, 0);
        },

        onTabSelect: function(oEvent) {
            this._clearSelections();
            var sSelectedKey = oEvent.getParameter("key");
            this._getMainModel().setProperty("/selectedKey", sSelectedKey);
            this._resetTableScroll(this._getTableByKey(sSelectedKey));
        },

        _readData: function(sKey, oTable) {
            // Load data for one tab and manage the request lifecycle with timeout handling.
            var oModel = this._getOwnerModel(),
                oMain = this._getMainModel(),
                sEntitySet = this._mEntitySets[sKey],
                oRequestState = {
                    completed: false
                },
                that = this;
            // declare timeout handle before starting the request so it can be cleared on success/error
            var iTimeout = null;
            var oRequest = oModel.read("/" + sEntitySet, {
                success: function(oData) {
                    that._handleReadSuccess(sKey, oTable, oRequestState, iTimeout, oData, oMain);
                },
                error: function(oError) {
                    that._handleReadError(sKey, oTable, oRequestState, iTimeout, oError, sEntitySet);
                }
            });
            iTimeout = setTimeout(function() {
                that._handleReadTimeout(sKey, oTable, oRequestState, oRequest);
            }, this.REQUEST_TIMEOUT_MS);
        },

        _handleReadSuccess: function(sKey, oTable, oRequestState, iTimeout, oData, oMain) {
            if (oRequestState.completed) {
                return;
            }
            oRequestState.completed = true;
            clearTimeout(iTimeout);
            var aResults = oData && oData.results ? oData.results : [];
            oMain.setProperty("/" + sKey, aResults);
            oMain.setProperty("/" + sKey + "Count", aResults.length);
            this._resetTableScroll(this._getTableByKey(sKey));
            this._finalizeRead(oTable, sKey, true, null);
        },

        _handleReadError: function(sKey, oTable, oRequestState, iTimeout, oError, sEntitySet) {
            if (oRequestState.completed) {
                return;
            }
            oRequestState.completed = true;
            clearTimeout(iTimeout);
            jQuery.sap.log.error("Failed to load " + sEntitySet, oError);
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._finalizeRead(oTable, sKey, false, oBundle.getText("msgLoadError", [sKey]));
        },

        _handleReadTimeout: function(sKey, oTable, oRequestState, oRequest) {
            if (oRequestState.completed) {
                return;
            }
            oRequestState.completed = true;
            if (oRequest && oRequest.abort) {
                oRequest.abort();
            }
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._finalizeRead(oTable, sKey, false, oBundle.getText("msgRequestTimedOut"));
        },

        _finalizeRead: function(oTable, sKey, bShowRefreshMessage, sMessage) {
            if (oTable) {
                oTable.setBusy(false);
                if (bShowRefreshMessage) {
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgRefreshSuccess", [sKey]));
                } else if (sMessage) {
                    MessageToast.show(sMessage);
                }
            } else {
                this._onReadFinished();
            }
        },

        _onReadFinished: function() {
            if (!this._pendingReads) {
                return;
            }
            this._pendingReads--;
            if (this._pendingReads === 0) {
                this.getView().setBusy(false);
            }
        },

        _loadAllData: function() {
            // Load all three approval tabs together and track when the async reads complete.
            this.getView().setBusy(true);
            this._pendingReads = 3;
            Object.keys(this._mEntitySets).forEach(function(sKey) {
                this._readData(sKey);
            }, this);
        },

        onNewRefresh: function() {
            this._refreshTab("New");
        },

        onInProgressRefresh: function() {
            this._refreshTab("InProgress");
        },

        onClosedRefresh: function() {
            this._refreshTab("Closed");
        },

        _refreshTab: function(sKey) {
            var oTable = this._getTableByKey(sKey);
            if (!oTable) {
                return;
            }
            oTable.clearSelection();
            oTable.setBusy(true);
            this._readData(sKey, oTable);
        },

        onRowSelectionChange: function(oEvent) {
            var oTable = oEvent.getSource();
            var aSelected = oTable.getSelectedIndices();
            if (aSelected.length > 1) {
                var iLatest = oEvent.getParameter("rowIndex");
                oTable.clearSelection();
                oTable.addSelectionInterval(iLatest, iLatest);
            }
        },

        _getSingleSelection: function(sMessage) {
            var oTable = this._getCurrentTable();
            if (!oTable) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(sMessage || oBundle.getText("msgSelectRecord"));
                return null;
            }
            var aIndices = oTable.getSelectedIndices();
            if (aIndices.length !== 1) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(sMessage || oBundle.getText("msgSelectRecord"));
                return null;
            }
            return oTable.getContextByIndex(aIndices[0]).getObject();
        },

        _navigateToApproval: function(sRouteName, oData) {
            // Build the route parameters for the review or display screens from the selected row.
            var sFullName = [oData.FIRSTNAME, oData.LASTNAME].filter(Boolean).join(" ");
            this.getOwnerComponent().getRouter().navTo(sRouteName, {
                user: encodeURIComponent(oData.EUSER),
                jobId: encodeURIComponent(oData.JOB_ID),
                connector: encodeURIComponent(oData.CONNECTOR),
                reviewType: encodeURIComponent(oData.REVIEW_TYPE),
                fullName: encodeURIComponent(sFullName)
            });
        },

        onReview: function() {
            var oData = this._getSingleSelection();
            if (!oData) {
                return;
            }
            var sRouteName;
            if (oData.REVIEW_TYPE === "SOD") {
                sRouteName = "SoDReviewView";
            } else {
                sRouteName = "ReviewView";
            }
            this._navigateToApproval(sRouteName, oData);
        },

        onDisplayReview: function() {
            var oData = this._getSingleSelection();
            if (!oData) {
                return;
            }
            var sRouteName;
            if (oData.REVIEW_TYPE === "SOD") {
                sRouteName = "SoDDisplayView";
            } else {
                sRouteName = "DisplayView";
            }
            this._navigateToApproval(sRouteName, oData);
        },

        onViewComment: function(oEvent) {
            var oContext =
                oEvent
                .getSource()
                .getBindingContext("main");
            var sComment =
                oContext.getProperty("COMMENTS") || "";
            var oBundle =
                this.getView()
                .getModel("i18n")
                .getResourceBundle();

            if (!this._oViewCommentDialog) {
                this._oViewCommentText =
                    new sap.m.Text({
                        text: ""
                    }).addStyleClass(
                        "sapUiSmallMargin"
                    );
                this._oViewCommentDialog =
                    new sap.m.Dialog({
                        title: oBundle.getText(
                            "dlgViewCommentTitle"
                        ),
                        contentWidth: "25rem",
                        content: [
                            this._oViewCommentText
                        ],
                        beginButton: new sap.m.Button({
                            text: oBundle.getText("btnClose"),
                            press: function() {
                                this._oViewCommentDialog.close();
                            }.bind(this)
                        })
                    });
                this.getView().addDependent(
                    this._oViewCommentDialog
                );
            }

            this._oViewCommentText.setText(
                sComment || oBundle.getText("msgNoComment")
            );
            this._oViewCommentDialog.open();
        },

        _getReassignDialog: function() {
            if (!this._oReassignDialog) {
                this._oReassignDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.ReassignDialog",
                    this
                );
                this.getView().addDependent(this._oReassignDialog);
            }
            return this._oReassignDialog;
        },

        onReassignCommentChange: function(oEvent) {
            var oTextArea = oEvent.getSource();
            var sValue = oEvent.getParameter("value").trim();
            if (sValue) {
                oTextArea.setValueState("None");
            }
        },

        onReviewerChange: function(oEvent) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oInput = oEvent.getSource();
            var sReviewer = oInput.getValue().trim().toUpperCase();
            if (!sReviewer) {
                oInput.setValueState("None");
                return;
            }
            var oModel = this._getOwnerModel();
            oModel.read("/Reassign_VHSet", {
                filters: [
                    new Filter(
                        "REVIEWER",
                        FilterOperator.EQ,
                        sReviewer
                    )
                ],
                success: function(oData) {
                    if (oData.results.length > 0) {
                        // Valid reviewer
                        oInput.setValue(sReviewer);
                        oInput.setValueState("None");
                        this._getReassignModel().setProperty(
                            "/reviewer",
                            oData.results[0].REVIEWER
                        );
                    } else {
                        oInput.setValueState("Error");
                        oInput.setValueStateText(oBundle.getText("valReviewerInvalid"));
                    }
                }.bind(this),
                error: function() {
                    oInput.setValueState("Error");
                    oInput.setValueStateText(oBundle.getText("valReviewerValidateError"));
                }
            });
        },

        onReviewerValueHelp: function() {
            if (!this._oReviewerVH) {
                this._oReviewerVH = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.ReviewerValueHelp",
                    this
                );
                this.getView().addDependent(this._oReviewerVH);
            }
            this._oReviewerVH.setModel(this._getOwnerModel());
            this._oReviewerVH.open();
        },

        onReviewerVHSearch: function(oEvent) {
            var sValue = oEvent.getParameter("value").toUpperCase();
            var oFilter = new Filter({
                filters: [
                    new Filter("REVIEWER", FilterOperator.Contains, sValue),
                    new Filter("REVIEWERNAME", FilterOperator.Contains, sValue)
                ],
                and: false
            });
            oEvent.getSource().getBinding("items").filter(oFilter);
        },

        onReviewerVHConfirm: function(oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                return;
            }
            var sReviewer = oSelectedItem.getTitle();
            this._getReassignModel().setProperty(
                "/reviewer",
                sReviewer
            );
            var oInput = this.byId("reviewerNameInput");
            if (oInput) {
                oInput.setValue(sReviewer);
                oInput.setValueState(sap.ui.core.ValueState.None);
                oInput.setValueStateText("");
            }
            this._destroyReviewerVHDialog();
        },

        onReviewerVHCancel: function() {
            this._destroyReviewerVHDialog();
        },
        
        _destroyReviewerVHDialog: function() {
            if (this._oReviewerVH) {
                this._oReviewerVH.destroy();
                this._oReviewerVH = null;
            }
        },

        onReassign: function() {
            // Validate selection and open the reassignment dialog for the chosen approval item.
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oData = this._getSingleSelection(oBundle.getText("msgSelectReassign"));
            if (!oData) {
                return;
            }
            this._oSelectedApproval = oData;
            this._resetReassignModel();
            this._getReassignDialog().open();
        },

        onReassignConfirm: function() {
            // Submit the reassignment request and refresh the impacted tab on success.
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oData = this._getReassignModel().getData();
            var oApproval = this._oSelectedApproval;
            var oModel = this._getOwnerModel();
            var oDialog = this._getReassignDialog();
            // Validate form
            if (!this._validateReassign(oData)) {
                return;
            }
            // Validate selected approval
            if (!oApproval) {
                MessageToast.show(oBundle.getText("msgSelectRecord"));
                return;
            }
            var oPayload = {
                JobId: oApproval.JOB_ID,
                EUSER: oApproval.EUSER,
                Reviewer1: oData.reviewer.trim().toUpperCase(),
                Comments: oData.reason.trim()
            };
            oDialog.setBusy(true);
            oModel.create("/RNOW_Approval_ReassignSet", oPayload, {
                success: function(oResponse) {
                    oDialog.setBusy(false);
                    MessageBox.success(
                        (oResponse && oResponse.Returnmsg) || oBundle.getText("msgReassignSuccess"), {
                            onClose: function() {
                                this._resetReassignModel();
                                this._oSelectedApproval = null;
                                oDialog.close();
                                var sKey = this._getCurrentKey();
                                if (sKey === "New" || sKey === "InProgress") {
                                    this._refreshTab(sKey);
                                }
                            }.bind(this)
                        }
                    );
                }.bind(this),
                error: function(oError) {
                    oDialog.setBusy(false);
                    var sMsg = "";
                    try {
                        var oBody = JSON.parse(oError.responseText);
                        sMsg = oBody.error.message.value;
                    } catch (e) {
                        sMsg = oError.responseText || oError.message;
                    }
                    MessageBox.error(
                        oBundle.getText("errReassignFailed") +
                        (sMsg ? "\n\n" + oBundle.getText("errBackendSays") + "\n" + sMsg : "")
                    );
                }.bind(this)
            });
        },

        onReassignCancel: function() {
            var oDialog = this._getReassignDialog();
            this._resetReassignModel();
            if (oDialog) {
                oDialog.close();
            }
        },

        _clearReassignValidation: function() {
            var oReviewer = this.byId("reviewerNameInput");
            var oComment = this.byId("reassignComment");
            [oReviewer, oComment].forEach(function(oControl) {
                if (oControl) {
                    oControl.setValueState(sap.ui.core.ValueState.None);
                    oControl.setValueStateText("");
                }
            });
        },

        _validateReassign: function(oData) {
            var oReviewer = this.byId("reviewerNameInput");
            var oComment = this.byId("reassignComment");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var bReviewerEmpty = !oData.reviewer || !oData.reviewer.trim();
            var bCommentEmpty = !oData.reason || !oData.reason.trim();
            // If both mandatory fields are empty
            if (bReviewerEmpty && bCommentEmpty) {
                MessageBox.warning(oBundle.getText("msgFillMandatory"));
                return false;
            }
            // Reviewer is mandatory
            if (bReviewerEmpty) {
                MessageBox.warning(oBundle.getText("valReviewerRequired"));
                return false;
            }
            // Reviewer was entered but is invalid
            if (oReviewer && oReviewer.getValueState() === sap.ui.core.ValueState.Error) {
                MessageBox.warning(oBundle.getText("msgReviewerInvalid"));
                return false;
            }
            // Reason is mandatory
            if (bCommentEmpty) {
                MessageBox.warning(oBundle.getText("valReasonRequired"));
                return false;
            }
            return true;
        },

        _resetReassignModel: function() {
            this._getReassignModel().setData({
                reviewer: "",
                reason: ""
            });
            this._clearReassignValidation();
        },

        onExit: function() {
            try {
                this.getOwnerComponent().getRouter().getRoute("RouteMain").detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
            var oTabBar = this.byId("mainTabBar");
            if (oTabBar) {
                oTabBar.detachBrowserEvent("mousedown", this._preventEmptyTabBarFocus, this);
            }
            if (this._oReassignDialog) {
                this._oReassignDialog.destroy();
                this._oReassignDialog = null;
            }
            if (this._oReviewerVH) {
                this._oReviewerVH.destroy();
                this._oReviewerVH = null;
            }
        }

    });
});