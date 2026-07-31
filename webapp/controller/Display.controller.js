sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";
    return Controller.extend("rnow.approval.corner.controller.Display", {
        onInit: function() {
            // Listen for route changes and initialize the local usage model.
            this.getOwnerComponent().getRouter().getRoute("DisplayView").attachPatternMatched(this._onRouteMatched, this);
            var oUsageModel = new JSONModel({
                title: "",
                Items: []
            });
            this.getView().setModel(oUsageModel, "usage");
        },

        _getODataModel: function() {
            return this.getOwnerComponent().getModel();
        },

        _getUsageModel: function() {
            return this.getView().getModel("usage");
        },

        _onRouteMatched: function(oEvent) {
            // Capture route parameters and prepare the display model for the selected review.
            var oArgs = oEvent.getParameter("arguments");
            this._sUser = decodeURIComponent(oArgs.user);
            this._sJobId = decodeURIComponent(oArgs.jobId);
            this._sConnector = decodeURIComponent(oArgs.connector);
            this._sReviewType = decodeURIComponent(oArgs.reviewType);
            this._sFullName = decodeURIComponent(oArgs.fullName);
            var oReviewModel = new JSONModel({
                pageTitle: this._sReviewType +
                    " Review of: " +
                    this._sUser +
                    " (" +
                    this._sFullName +
                    ") - Job ID #" +
                    this._sJobId,
                Items: []
            });
            this.getView().setModel(oReviewModel, "Display");
            this._loadDisplayData();
        },

        _loadDisplayData: function(bShowToast) {
            // Load review detail records for the current user, job, and connector.
            var oModel = this.getOwnerComponent().getModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            oModel.setUseBatch(false);
            this.getView().setBusy(true);
            oModel.read("/RNOW_ReviewDetailSet", {
                filters: [
                    new Filter("EUser", FilterOperator.EQ, this._sUser),
                    new Filter("JobId", FilterOperator.EQ, this._sJobId),
                    new Filter("Connector", FilterOperator.EQ, this._sConnector)
                ],
                success: function(oData) {
                    var aItems = oData.results || [];
                    aItems.forEach(function(oItem) {
                        if (oItem.Action === "RT") {
                            oItem.Action = oBundle.getText("btnRetain");
                        } else if (oItem.Action === "RM") {
                            oItem.Action = oBundle.getText("btnRemove");
                        }
                    });
                    this.getView().getModel("Display").setProperty("/Items", aItems);
                    this.byId("DisplayTable").clearSelection();
                    this.getView().setBusy(false);
                    if (bShowToast) {
                        setTimeout(function() {
                            MessageToast.show(oBundle.getText("msgRefreshSuccess", ["Review"]));
                        }, 100);
                    }
                }.bind(this),
                error: function() {
                    this.getView().setBusy(false);
                    MessageToast.show(oBundle.getText("msgLoadError", ["review details"]));
                }.bind(this)
            });
        },

        onUtilizedPress: function(oEvent) {
            // Open the usage dialog and load the related transaction data for the selected role.
            var oRole = oEvent.getSource().getBindingContext("Display").getObject();
            this._oSelectedRole = oRole;
            if (!this._oUsageDialog) {
                this._oUsageDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.UsageDisplayDialog",
                    this
                );
                this.getView().addDependent(this._oUsageDialog);
            }
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this.getView().getModel("usage").setProperty(
                "/title",
                oBundle.getText("usageTitle", [oRole.Role])
            );
            this._loadUsageData(oRole);
            this._oUsageDialog.open();
        },

        onUsageDialogClose: function() {
            this._oUsageDialog.close();
        },

        _loadUsageData: function(oRole) {
            // Fetch usage analysis entries for the selected role and prepare them for display.
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._oUsageRow = oRole;
            var oModel = this._getODataModel();
            oModel.setUseBatch(false);
            this._oUsageDialog.setBusy(true);
            var aFilters = [
                new Filter("Rfcdest", FilterOperator.EQ, this._sConnector),
                new Filter("EUSER", FilterOperator.EQ, this._sUser),
                new Filter("JOB_ID", FilterOperator.EQ, this._sJobId),
                new Filter("AgrName", FilterOperator.EQ, oRole.Role)
            ];
            oModel.read("/utilized_TcodesSet", {
                filters: aFilters,
                success: function(oData) {
                    var aItems = oData.results || [];
                    aItems.forEach(function(oItem) {
                        oItem.OriginalAction = oItem.Action;
                        oItem.OriginalComment = oItem.comments;
                    });
                    this._getUsageModel().setProperty("/Items", aItems);
                    this._oUsageDialog.setBusy(false);
                    var oTable = this.byId("usageDisplayTable");
                    if (!this._bUsageHighlightBound) {
                        this._bUsageHighlightBound = true;
                        oTable.attachEvent("rowsUpdated", this._highlightCriticalRows, this);
                        oTable.attachEvent("firstVisibleRowChanged", this._highlightCriticalRows, this);
                    }
                    this._highlightCriticalRows();
                }.bind(this),
                error: function(oError) {
                    this._oUsageDialog.setBusy(false);
                    MessageToast.show(oBundle.getText("msgLoadError", ["usage analysis"]));
                }.bind(this)
            });
        },

        _highlightCriticalRows: function() {
            // Mark rows that require special attention based on the critical flag.
            var oTable = this.byId("usageDisplayTable");
            var aRows = oTable.getRows();
            aRows.forEach(function(oRow) {
                oRow.removeStyleClass("criticalRow");
                var oContext = oRow.getBindingContext("usage");
                if (!oContext) {
                    return;
                }
                var oData = oContext.getObject();
                if (oData.CriticalTcode === "YES") {
                    oRow.addStyleClass("criticalRow");
                }
            }, this);
        },

        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        onCancel: function() {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        onExit: function() {
            try {
                this.getOwnerComponent().getRouter().getRoute("DisplayView").detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
            if (this._oUsageDialog) {
                this._oUsageDialog.destroy();
                this._oUsageDialog = null;
            }
        }
        
    });
});