sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";
    return Controller.extend("rnow.approval.corner.controller.SoDReview", {

        onInit: function() {
            this.getOwnerComponent().getRouter().getRoute("SoDReviewView").attachPatternMatched(this._onRouteMatched, this);
            var oUsageModel = new JSONModel({ title: "", Items: [] });
            this.getView().setModel(oUsageModel, "usage");
            var oConflictModel = new JSONModel({ title: "", Items: [] });
            this.getView().setModel(oConflictModel, "conflict");
        },

        _getReviewModel: function() {
            return this.getView().getModel("review");
        },

        _getUsageModel: function() {
            return this.getView().getModel("usage");
        },

        _getODataModel: function() {
            return this.getOwnerComponent().getModel();
        },

        _getConflictModel: function() {
            return this.getView().getModel("conflict");
        },

        _getCurrentUser: function() {
            if (sap.ushell && sap.ushell.Container) {
                var oUser = sap.ushell.Container.getUser();
                if (oUser) {
                    this._LoginUser = oUser.getId();
                    this._sFullName = oUser.getFullName();
                    return this._LoginUser;
                }
            }
            this._LoginUser = "DEFAULT_USER";
            return this._LoginUser;
        },

        _onRouteMatched: function(oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            this._sUser = decodeURIComponent(oArgs.user);
            this._sJobId = decodeURIComponent(oArgs.jobId);
            this._sConnector = decodeURIComponent(oArgs.connector);
            this._sReviewType = decodeURIComponent(oArgs.reviewType);
            this._sFullName = decodeURIComponent(oArgs.fullName);
            var oReviewModel = new JSONModel({
                pageTitle: this._sReviewType + " Review of: " + this._sFullName + " - Job ID #" + this._sJobId,
                Items: [],
                OriginalItems: []
            });
            this.getView().setModel(oReviewModel, "review");
            this._loadReviewData();
        },

        onRefresh: function() {
            this._loadReviewData(true);
        },

        _loadReviewData: function(bShowToast) {
            var oModel = this._getODataModel();
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
                    var aOriginalItems = this._snapshotEditableItems(aItems);
                    this._bReviewChanged = false;
                    var oReviewModel = this._getReviewModel();
                    oReviewModel.setProperty("/Items", aItems);
                    oReviewModel.setProperty("/OriginalItems", aOriginalItems);
                    this.byId("sodReviewTable").clearSelection();
                    this.getView().setBusy(false);
                    if (bShowToast) {
                        setTimeout(function() {
                            MessageToast.show(oBundle.getText("msgRefreshSuccess", ["SOD Review"]));
                        }, 100);
                    }
                }.bind(this),
                error: function() {
                    this.getView().setBusy(false);
                    MessageToast.show(oBundle.getText("msgLoadError", ["SOD review details"]));
                }.bind(this)
            });
        },

        onSave: function() {
            var aChangedItems = this._collectChangedItems();
            if (!aChangedItems) return;
            if (aChangedItems.length === 0) {
                MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgNoChangesSave"));
                return;
            }
            this._saveReview(aChangedItems, "/RNOW_NEWSet");
        },

        onSubmit: function() {
            var aChangedItems = this._collectChangedItems();
            if (!aChangedItems) return;
            if (aChangedItems.length === 0) aChangedItems = this._getReviewModel().getProperty("/Items") || [];
            this._aPendingSubmitItems = aChangedItems;
            this._openSubmitDialog();
        },

        _collectChangedItems: function() {
            if (!this._bReviewChanged) return [];
            var oModel = this._getReviewModel();
            var aItems = oModel.getProperty("/Items") || [];
            var aOriginalItems = oModel.getProperty("/OriginalItems") || [];
            var aChangedItems = [];
            for (var i = 0; i < aItems.length; i++) {
                var oItem = aItems[i];
                var oOriginal = aOriginalItems[i] || {};
                var bActionChanged = (oItem.Action || "") !== (oOriginal.Action || "");
                var bMitActionChanged = (oItem.MidAction || "") !== (oOriginal.MidAction || "");
                var bCommentChanged = (oItem.Comment || "") !== (oOriginal.Comment || "");
                var bChanged = bActionChanged || bMitActionChanged || bCommentChanged;
                if (!bChanged) continue;
                if (!this._validateCommentForRow(oModel, "/Items/" + i)) {
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("valCommentMandatoryRemove"));
                    return null;
                }
                aChangedItems.push(oItem);
            }
            return aChangedItems;
        },

        _snapshotEditableItems: function(aItems) {
            return aItems.map(function(oItem) {
                return {
                    Action: oItem.Action || "",
                    MidAction: oItem.MidAction || "",
                    Comment: oItem.Comment || ""
                };
            });
        },

        _openSubmitDialog: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (!this._oSubmitDialog) {
                this._oSubmitTextArea = new sap.m.TextArea({
                    width: "100%",
                    rows: 5,
                    maxLength: 200,
                    required: true,
                    placeholder: oBundle.getText("reviewCommentsPlaceholder"),
                    liveChange: function(oEvent) {
                        var sValue = oEvent.getParameter("value").trim();
                        if (sValue) this._oSubmitTextArea.setValueState("None");
                    }.bind(this)
                });
                this._oSubmitDialog = new sap.m.Dialog({
                    title: oBundle.getText("dlgReviewCommentsTitle"),
                    content: [this._oSubmitTextArea],
                    beginButton: new sap.m.Button({
                        text: oBundle.getText("btnOk"),
                        type: "Accept",
                        press: function() {
                            var sComment = this._oSubmitTextArea.getValue().trim();
                            if (!sComment) {
                                this._oSubmitTextArea.setValueState("Error");
                                this._oSubmitTextArea.setValueStateText(oBundle.getText("msgEnterReviewComments"));
                                return;
                            }
                            this._oSubmitDialog.close();
                            this._submitReview(this._aPendingSubmitItems || [], sComment);
                        }.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: oBundle.getText("btnCancel"),
                        press: function() { this._oSubmitDialog.close(); }.bind(this)
                    })
                });
                this.getView().addDependent(this._oSubmitDialog);
            }
            this._oSubmitTextArea.setValue("");
            this._oSubmitTextArea.setValueState("None");
            this._oSubmitDialog.open();
        },

        _submitReview: function(aChangedItems, sReviewComment) {
            var oODataModel = this._getODataModel();
            var oView = this.getView();
            this._getCurrentUser();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oPayload = this._buildReviewPayload(aChangedItems, sReviewComment);
            oView.setBusy(true);
            oODataModel.create("/RNOW_NEWSet", oPayload, {
                success: function(oData) {
                    oView.setBusy(false);
                    MessageBox.success((oData && oData.Message) || oBundle.getText("msgReviewSubmitted"), {
                        onClose: function() { this.onNavBack(); }.bind(this)
                    });
                    this._markItemsAsSaved(aChangedItems);
                    this._aPendingSubmitItems = null;
                }.bind(this),
                error: function(oError) {
                    oView.setBusy(false);
                    MessageBox.error(this._getErrorMessage(oError, oBundle.getText("errSubmitFailed")));
                }.bind(this)
            });
        },

        _buildReviewPayload: function(aChangedItems, sReviewComment) {
            return {
                LoginUser: this._LoginUser || this._getCurrentUser() || "",
                CONNECTOR: this._sConnector,
                EUSER: this._sUser,
                JOB_ID: this._sJobId,
                REVCYCLENAME: this._sReviewCycle || "",
                ATT_FISCAL: this._sFiscalYear || "",
                ATT_QUARTERLY: this._sQuarter || "",
                FIRSTNAME: this._sFirstName || "",
                LASTNAME: this._sLastName || "",
                REVIEW_TYPE: this._sReviewType || "",
                STATUS: "",
                RoleManager: "",
                SodReview: sReviewComment || "",
                ParamVal3008: "",
                UserLockStatus: "",
                RCount: "",
                PCount: "",
                UserGroup: "",
                LicCat: "",
                ValidFrom: "",
                ValidTo: "",
                LockStatus: "",
                LastLogon: "",
                Role: "",
                PARAM5004: "",
                REVIEWTOITEMNAV: aChangedItems.map(function(oItem) {
                    return {
                        LOGINUSER: oItem.LOGINUSER || this._LoginUser || this._getCurrentUser(),
                        Connector: oItem.Connector || this._sConnector,
                        JobId: oItem.JobId || this._sJobId,
                        EUser: oItem.EUser || this._sUser,
                        FullName: oItem.FullName || "",
                        Role: oItem.Role || "",
                        RoleDesc: oItem.RoleDesc || "",
                        LicCat: oItem.LicCat || "",
                        FromDate: oItem.FromDate || "",
                        ToDate: oItem.ToDate || "",
                        UtilizationText: oItem.UtilizationText || "",
                        COMMENT: oItem.Comment || "",
                        Action: oItem.Action || "",
                        RiskId: oItem.RiskId || "",
                        RiskDescn: oItem.RiskDescn || "",
                        RiskLevel: oItem.RiskLevel || "",
                        Function: oItem.Function || "",
                        FunctDesc: oItem.FunctDesc || "",
                        Mcid: oItem.Mcid || "",
                        LineCount: oItem.LineCount || "",
                        MidAction: oItem.MidAction || ""
                    };
                }.bind(this))
            };
        },

        _saveReview: function(aChangedItems, sEntitySet) {
            var oODataModel = this._getODataModel();
            var oView = this.getView();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._getCurrentUser();
            var oPayload = this._buildReviewPayload(aChangedItems);
            oView.setBusy(true);
            oODataModel.create(sEntitySet, oPayload, {
                success: function(oData) {
                    oView.setBusy(false);
                    MessageToast.show((oData && oData.Message) || oBundle.getText("msgReviewSaved"));
                    this._markItemsAsSaved(aChangedItems);
                    setTimeout(function() { this.onNavBack(); }.bind(this), 1500);
                }.bind(this),
                error: function(oError) {
                    oView.setBusy(false);
                    MessageBox.error(this._getErrorMessage(oError, oBundle.getText("errOperationFailed")));
                }.bind(this)
            });
        },

        _markItemsAsSaved: function(aChangedItems) {
            var oModel = this._getReviewModel();
            oModel.setProperty("/OriginalItems", this._snapshotEditableItems(oModel.getProperty("/Items") || []));
        },

        _getErrorMessage: function(oError, sFallback) {
            var sMsg = sFallback;
            try {
                var oBody = JSON.parse(oError.responseText);
                sMsg = oBody.error.message.value;
            } catch (e) {
                sMsg = oError.responseText || oError.message || sFallback;
            }
            return sMsg;
        },

        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        onCancel: function() {
            this.byId("sodReviewTable").clearSelection();
        },

        onRetain: function() {
            this._updateSelectedRowsAction("Action", "RT");
        },

        onRemove: function() {
            this._updateSelectedRowsAction("Action", "RM");
        },

        onMitRetain: function() {
            this._updateSelectedRowsAction("MidAction", "RT");
        },

        onMitRemove: function() {
            this._updateSelectedRowsAction("MidAction", "RM");
        },

        onMitExtend: function() {
            this._updateSelectedRowsAction("MidAction", "EX");
        },

        onMitActionChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            this._validateCommentForRow(oContext.getModel(), oContext.getPath());
        },

        onMassComments: function() {
            var oTable = this.byId("sodReviewTable");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var aSelectedIndices = oTable.getSelectedIndices();
            if (aSelectedIndices.length === 0) {
                MessageToast.show(oBundle.getText("msgSelectRecord"));
                return;
            }
            this._aMassCommentIndices = aSelectedIndices;
            this._openMassCommentDialog();
        },

        _openMassCommentDialog: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (!this._oMassCommentDialog) {
                this._oMassCommentTextArea = new sap.m.TextArea({
                    width: "100%",
                    rows: 5,
                    maxLength: 200,
                    placeholder: oBundle.getText("commentPlaceholder")
                });
                this._oMassCommentDialog = new sap.m.Dialog({
                    title: oBundle.getText("dlgMassCommentTitle"),
                    content: [this._oMassCommentTextArea],
                    beginButton: new sap.m.Button({
                        text: oBundle.getText("btnOk"),
                        type: "Accept",
                        press: function() {
                            var sComment = this._oMassCommentTextArea.getValue().trim();
                            if (!sComment) {
                                this._oMassCommentTextArea.setValueState("Error");
                                this._oMassCommentTextArea.setValueStateText(oBundle.getText("msgEnterReviewComments"));
                                return;
                            }
                            this._applyMassComment(sComment);
                            this._oMassCommentDialog.close();
                        }.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: oBundle.getText("btnCancel"),
                        press: function() { this._oMassCommentDialog.close(); }.bind(this)
                    })
                });
                this.getView().addDependent(this._oMassCommentDialog);
            }
            this._oMassCommentTextArea.setValue("");
            this._oMassCommentTextArea.setValueState("None");
            this._oMassCommentDialog.open();
        },

        _applyMassComment: function(sComment) {
            var oTable = this.byId("sodReviewTable");
            var oModel = this.getView().getModel("review");
            this._bReviewChanged = true;
            (this._aMassCommentIndices || []).forEach(function(iIndex) {
                var sPath = oTable.getContextByIndex(iIndex).getPath();
                oModel.setProperty(sPath + "/Comment", sComment);
                this._validateCommentForRow(oModel, sPath);
            }.bind(this));
            this._aMassCommentIndices = null;
        },

        _updateSelectedRowsAction: function(sProperty, sAction) {
            var oTable = this.byId("sodReviewTable");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oModel = this.getView().getModel("review");
            var aSelectedIndices = oTable.getSelectedIndices();
            if (aSelectedIndices.length === 0) {
                MessageToast.show(oBundle.getText("msgSelectRecord"));
                return;
            }
            this._bReviewChanged = true;
            aSelectedIndices.forEach(function(iIndex) {
                var sPath = oTable.getContextByIndex(iIndex).getPath();
                oModel.setProperty(sPath + "/" + sProperty, sAction);
                this._validateCommentForRow(oModel, sPath);
            }.bind(this));
        },

        onRiskActionChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            this._bReviewChanged = true;
            this._validateCommentForRow(oContext.getModel(), oContext.getPath());
        },

        onCommentChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            this._bReviewChanged = true;
            this._validateCommentForRow(oContext.getModel(), oContext.getPath());
        },

        _validateCommentForRow: function(oModel, sPath) {
            var sAction = oModel.getProperty(sPath + "/Action") || "";
            var sMidAction = oModel.getProperty(sPath + "/MidAction") || "";
            var sComment = (oModel.getProperty(sPath + "/Comment") || "").trim();
            var bError = (sAction === "RM" || sMidAction === "RM" || sMidAction === "EX") && !sComment;
            oModel.setProperty(sPath + "/CommentState", bError ? "Error" : "None");
            return !bError;
        },

        onConflictPress: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            var oItem = oContext.getObject();
            console.log("Selected SOD conflict:", oItem);
        },

        onMitigationVHRequest: function(oEvent) {
            this._oMitigationInput = oEvent.getSource();
            if (!this._oMitigationVHDialog) {
                this._oMitigationVHDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.MitigationVH",
                    this
                );
                this.getView().addDependent(this._oMitigationVHDialog);
            }
            this._oMitigationVHDialog.open();
        },

        onMitigationVHSearch: function (oEvent) {
    var sValue = oEvent.getParameter("value") || "";
    var oBinding = oEvent.getSource().getBinding("items");

    if (!oBinding) {
        return;
    }

    if (!sValue.trim()) {
        oBinding.filter([]);
        return;
    }

    var oFilter = new sap.ui.model.Filter(
        "ACCONTROLID",
        sap.ui.model.FilterOperator.Contains,
        sValue.trim()
    );

    oBinding.filter([oFilter]);
},

        onMitigationVHConfirm: function(oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem || !this._oMitigationInput) {
                return;
            }
            var oSelectedData =
                oSelectedItem.getBindingContext().getObject();
            var oInputContext =
                this._oMitigationInput.getBindingContext("review");
            if (oInputContext) {
                oInputContext.getModel().setProperty(
                    oInputContext.getPath() + "/Mcid",
                    oSelectedData.ACCONTROLID || ""
                );
            }
            this._oMitigationVHDialog.close();
            this._oMitigationInput = null;
        },

        onMitigationVHCancel: function() {
            if (this._oMitigationVHDialog) {
                this._oMitigationVHDialog.close();
            }
            this._oMitigationInput = null;
        },

        onConflictPress: function(oEvent) {

            var oConflict = oEvent
                .getSource()
                .getBindingContext("review")
                .getObject();

            this._oSelectedConflict = oConflict;

            if (!this._oConflictDialog) {

                this._oConflictDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.ConflictAnalysisDialog",
                    this
                );

                this.getView().addDependent(this._oConflictDialog);
            }

            var oBundle = this.getView()
                .getModel("i18n")
                .getResourceBundle();

            this._getConflictModel().setProperty(
                "/title",
                oBundle.getText(
                    "conflictTitle",
                    [oConflict.RiskId || ""]
                )
            );

            this._loadConflictData(oConflict);

            this._oConflictDialog.open();
        },

       _loadConflictData: function(oConflict) {

    var oModel = this._getODataModel();

    oModel.setUseBatch(false);

    this._oConflictDialog.setBusy(true);

    var aFilters = [
        new Filter(
            "GUSER",
            FilterOperator.EQ,
            this._sUser
        ),
        new Filter(
            "JOB_ID",
            FilterOperator.EQ,
            this._sJobId
        ),
        new Filter(
            "RISK",
            FilterOperator.EQ,
            oConflict.RiskId
        )
    ];

    oModel.read("/utilized_TcodesSet", {

        filters: aFilters,

        success: function(oData) {

            var aItems = oData.results || [];

            this._getConflictModel().setProperty(
                "/Items",
                aItems
            );

            this._oConflictDialog.setBusy(false);

        }.bind(this),

        error: function(oError) {

            this._oConflictDialog.setBusy(false);

            var oBundle = this.getView()
                .getModel("i18n")
                .getResourceBundle();

            MessageToast.show(
                oBundle.getText(
                    "msgLoadError",
                    ["conflict details"]
                )
            );

        }.bind(this)
    });
},
        onConflictDialogClose: function() {
            if (this._oConflictDialog) {
                this._oConflictDialog.close();
            }
        },

        onExit: function() {
            try {
                this.getOwnerComponent().getRouter().getRoute("SoDReviewView").detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
            if (this._oSubmitDialog) {
                this._oSubmitDialog.destroy();
                this._oSubmitDialog = null;
                this._oSubmitTextArea = null;
            }
            if (this._oMassCommentDialog) {
                this._oMassCommentDialog.destroy();
                this._oMassCommentDialog = null;
                this._oMassCommentTextArea = null;
            }
        }

    });
});