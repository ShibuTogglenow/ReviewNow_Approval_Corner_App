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
            this.REQUEST_TIMEOUT_MS = 30000;
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

        onTabSelect: function(oEvent) {
            this._getMainModel().setProperty("/selectedKey", oEvent.getParameter("key"));
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
            if (oData) {
                this._navigateToApproval("ReviewView", oData);
            }
        },

        onDisplayReview: function() {
            var oData = this._getSingleSelection();
            if (oData) {
                this._navigateToApproval("DisplayView", oData);
            }
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
            var oFilter = new sap.ui.model.Filter({
                filters: [
                    new sap.ui.model.Filter("REVIEWER", sap.ui.model.FilterOperator.Contains, sValue),
                    new sap.ui.model.Filter("REVIEWERNAME", sap.ui.model.FilterOperator.Contains, sValue)
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
            this._getReassignModel().setProperty(
                "/reviewer",
                oSelectedItem.getTitle()
            );
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
            var oData = this._getReassignModel().getData(),
                oApproval = this._oSelectedApproval,
                oModel = this._getOwnerModel(),
                oDialog = this._getReassignDialog();
            if (!this._validateReassign(oData)) {
                return;
            }
            if (!oApproval) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
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
                    MessageToast.show(
                        (oResponse && oResponse.Returnmsg) || oBundle.getText("msgReassignSuccess")
                    );
                    this._resetReassignModel();
                    oDialog.close();
                    var sKey = this._getCurrentKey();
                    if (sKey === "New" || sKey === "InProgress") {
                        this._refreshTab(sKey);
                    }
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
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
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

        _validateReassign: function(oData) {
            var oReviewer = this.byId("reviewerNameInput"),
                oComment = this.byId("reassignComment"),
                bValid = true;
            if (oReviewer) {
                oReviewer.setValueState("None");
            }
            if (oComment) {
                oComment.setValueState("None");
            }
            if (!oData.reviewer || !oData.reviewer.trim()) {
                if (oReviewer) {
                    oReviewer.setValueState("Error");
                    oReviewer.setValueStateText(this.getView().getModel("i18n").getResourceBundle().getText("valReviewerRequired"));
                }
                bValid = false;
            }
            if (!oData.reason || !oData.reason.trim()) {
                if (oComment) {
                    oComment.setValueState("Error");
                    oComment.setValueStateText(this.getView().getModel("i18n").getResourceBundle().getText("valReasonRequired"));
                }
                bValid = false;
            }
            if (!bValid) {
                MessageBox.warning(this.getView().getModel("i18n").getResourceBundle().getText("msgFillMandatory"));
            }
            return bValid;
        },

        _resetReassignModel: function() {
            this._getReassignModel().setData({
                reviewer: "",
                reason: ""
            });
        },
        
        onExit: function() {
            try {
                this.getOwnerComponent().getRouter().getRoute("RouteMain").detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
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