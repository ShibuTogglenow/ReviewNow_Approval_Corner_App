sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast) {
    "use strict";

    return Controller.extend("rnow.approval.corner.controller.SoDDisplay", {

        onInit: function() {
            this.getOwnerComponent().getRouter().getRoute("SoDDisplayView").attachPatternMatched(this._onRouteMatched, this);
        },

        _getSoDDisplayModel: function() {
            return this.getView().getModel("sodDisplayModel");
        },

        _getODataModel: function() {
            return this.getOwnerComponent().getModel();
        },

        _resetTableScroll: function() {
            var oTable = this.byId("sodDisplayTable");
            if (!oTable) {
                return;
            }
            oTable.setFirstVisibleRow(0);
            var oHorizontalScrollbar = oTable.getDomRef("hsb");
            if (oHorizontalScrollbar) {
                oHorizontalScrollbar.scrollLeft = 0;
            }
            var oVerticalScrollbar = oTable.getDomRef("vsb");
            if (oVerticalScrollbar) {
                oVerticalScrollbar.scrollTop = 0;
            }
        },

        _onRouteMatched: function(oEvent) {
            this._resetTableScroll();
            var oArgs = oEvent.getParameter("arguments");
            this._sUser = decodeURIComponent(oArgs.user);
            this._sJobId = decodeURIComponent(oArgs.jobId);
            this._sConnector = decodeURIComponent(oArgs.connector);
            this._sReviewType = decodeURIComponent(oArgs.reviewType);
            this._sFullName = decodeURIComponent(oArgs.fullName);
            var oSoDDisplayModel = new JSONModel({
                pageTitle: this._sReviewType + " Review of: " + this._sFullName + " - Job ID #" + this._sJobId,
                Items: []
            });
            this.getView().setModel(oSoDDisplayModel, "sodDisplayModel");
            this._loadReviewData();
        },

        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        onCancel: function() {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        _loadReviewData: function() {
            var oModel = this._getODataModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._reviewRequestId = (this._reviewRequestId || 0) + 1;
            var iRequestId = this._reviewRequestId;

            oModel.setUseBatch(false);
            this.getView().setBusy(true);

            oModel.read("/RNOW_ReviewDetailSet", {
                filters: [
                    new Filter("EUser", FilterOperator.EQ, this._sUser),
                    new Filter("JobId", FilterOperator.EQ, this._sJobId),
                    new Filter("Connector", FilterOperator.EQ, this._sConnector)
                ],
                success: function(oData) {
                    if (iRequestId !== this._reviewRequestId) {
                        return;
                    }
                    var aItems = oData.results || [];

                    this._getSoDDisplayModel().setProperty("/Items", aItems);
                    this.getView().setBusy(false);
                }.bind(this),
                error: function() {
                    if (iRequestId !== this._reviewRequestId) {
                        return;
                    }
                    this.getView().setBusy(false);
                    MessageToast.show(oBundle.getText("msgLoadError", ["SOD review details"]));
                }.bind(this)
            });
        },

        onExit: function() {
            try {
                this.getOwnerComponent().getRouter()
                    .getRoute("SoDDisplayView")
                    .detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
        }

    });
});