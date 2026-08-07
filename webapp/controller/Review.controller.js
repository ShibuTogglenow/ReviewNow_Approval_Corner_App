sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";
    return Controller.extend("rnow.approval.corner.controller.Review", {
        onInit: function() {
            // Register the route handler and initialize the usage model used by the dialog.
            this.getOwnerComponent().getRouter().getRoute("ReviewView").attachPatternMatched(this._onRouteMatched, this);
            var oUsageModel = new JSONModel({
                title: "",
                Items: []
            });
            this.getView().setModel(oUsageModel, "usage");
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
            // Capture the selected review context from the route and prepare the review model.
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
            this.getView().setModel(oReviewModel, "review");
            this._loadReviewData();
        },

        onRefresh: function() {
            this._loadReviewData(true);
        },

       _loadReviewData: function(bShowToast) {
            // Load review detail rows for the selected user, job, and connector.
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
                    var aOriginalItems = JSON.parse(JSON.stringify(aItems));
                    var oReviewModel = this._getReviewModel();
                    oReviewModel.setProperty("/Items", aItems);
                    oReviewModel.setProperty("/OriginalItems", aOriginalItems);
                    this.byId("reviewTable").clearSelection();
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

        onSave: function() {
            // Save the current review changes directly without opening the submit dialog.
            var aChangedItems = this._collectChangedItems();
            if (!aChangedItems) {
                return;
            }
            if (aChangedItems.length === 0) {
                MessageToast.show("No changes to save.");
                return;
            }
            this._saveReview(aChangedItems, "/RNOW_NEWSet");
        },

        onSubmit: function() {
            // Collect changed rows and open the comment dialog before submission.
            var aChangedItems = this._collectChangedItems();
            if (!aChangedItems) {
                return;
            }
             if (aChangedItems.length === 0) {
                aChangedItems = this._getReviewModel().getProperty("/Items") || [];
            }
            this._openSubmitDialog(aChangedItems);
        },

        _collectChangedItems: function() {
            // Gather only rows that were modified and validate mandatory comments for remove actions.
            var oModel = this._getReviewModel();
            var aItems = oModel.getProperty("/Items") || [];
            var aOriginalItems = oModel.getProperty("/OriginalItems") || [];
            var aChangedItems = [];
            for (var i = 0; i < aItems.length; i++) {
                var oItem = aItems[i];
                var oOriginal = aOriginalItems[i];
                var bChanged =
                    (oItem.Action || "") !== (oOriginal.Action || "") ||
                    (oItem.Comment || "") !== (oOriginal.Comment || "");
                if (!bChanged) {
                    continue;
                }
                if (!this._validateCommentForRow(oModel, "/Items/" + i)) {
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                     MessageToast.show(oBundle.getText("valCommentMandatoryRemove"));
                    return null;
                }
                aChangedItems.push(oItem);
            }
            return aChangedItems;
        },

        _openSubmitDialog: function(aChangedItems) {
            // Prompt the user for a review comment before sending the approval payload.
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (!this._oSubmitDialog) {
                this._oSubmitTextArea = new sap.m.TextArea({
                    width: "100%",
                    rows: 5,
                    maxLength: 200,
                    required: true,
                    placeholder: oBundle.getText("reviewCommentsPlaceholder")
                });
                this._oSubmitDialog = new sap.m.Dialog({
                    title: oBundle.getText("dlgReviewCommentsTitle"),
                    content: [
                        this._oSubmitTextArea
                    ],
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
                            this._submitReview(aChangedItems, sComment);
                        }.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: this.getView().getModel("i18n").getResourceBundle().getText("btnCancel"),
                        press: function() {
                            this._oSubmitDialog.close();
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oSubmitDialog);
            }
            this._oSubmitTextArea.setValue("");
            this._oSubmitTextArea.setValueState("None");
            this._oSubmitDialog.open();
        },

        _submitReview: function(aChangedItems, sReviewComment) {
            // Build the final payload and submit the review to the backend.
            var oODataModel = this._getODataModel();
            var oView = this.getView();
            this._getCurrentUser();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oPayload = this._buildReviewPayload(aChangedItems, sReviewComment);
            oView.setBusy(true);
            oODataModel.create("/RNOW_NEWSet", oPayload, {
                success: function(oData) {
                    oView.setBusy(false);
                    MessageBox.success((oData && oData.Message) || oBundle.getText("msgReviewSubmitted"));
                    this._markItemsAsSaved(aChangedItems);
                    oView.getModel("review").refresh(true);
                    this.onNavBack();
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
                        Action: oItem.Action || ""
                    };
                }.bind(this))
            };
        },

        _saveReview: function(aChangedItems, sEntitySet) {
            // Persist the review changes using the supplied entity set.
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
                    oView.getModel("review").refresh(true);
                    this.onNavBack();
                }.bind(this),
                error: function(oError) {
                    oView.setBusy(false);
                    MessageBox.error(this._getErrorMessage(oError, oBundle.getText("errOperationFailed")));
                }.bind(this)
            });
        },

        _markItemsAsSaved: function(aChangedItems) {
            aChangedItems.forEach(function(oItem) {
                oItem.OriginalAction = oItem.Action;
                oItem.OriginalComment = oItem.Comment;
            });
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
            this.byId("reviewTable").clearSelection();
            // var oReviewModel = this._getReviewModel();
            // var aOriginalItems = oReviewModel.getProperty("/OriginalItems") || [];
            // oReviewModel.setProperty(
            //     "/Items",
            //     JSON.parse(JSON.stringify(aOriginalItems))
            // );
            // oReviewModel.refresh(true);
        },

        onRetain: function() {
            this._updateSelectedRows("RT");
        },

        onRemove: function() {
            this._updateSelectedRows("RM");
        },

        _updateSelectedRows: function(sAction) {
            // Apply the selected action to all currently chosen rows and validate comments.
            var oTable = this.byId("reviewTable"),
                oModel = this.getView().getModel("review"),
                aSelectedIndices = oTable.getSelectedIndices();
            if (aSelectedIndices.length === 0) {
                MessageToast.show("Please select at least one record.");
                return;
            }
            aSelectedIndices.forEach(function(iIndex) {
                var sPath = oTable.getContextByIndex(iIndex).getPath();
                oModel.setProperty(sPath + "/Action", sAction);
                this._validateCommentForRow(oModel, sPath);
            }.bind(this));
        },

        onActionChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            this._validateCommentForRow(oContext.getModel(), oContext.getPath());
        },

        onCommentChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("review");
            this._validateCommentForRow(oContext.getModel(), oContext.getPath());
        },

        _validateCommentForRow: function(oModel, sPath) {
            // Require a comment when a row is marked for removal.
            var sAction = oModel.getProperty(sPath + "/Action") || "";
            var sComment = (oModel.getProperty(sPath + "/Comment") || "").trim();
            var bError = (sAction === "RM") && !sComment;
            oModel.setProperty(
                sPath + "/CommentState",
                bError ? "Error" : "None"
            );
            return !bError;
        },

        onUtilizedPress: function(oEvent) {
            // Open the usage analysis dialog for the selected role and load its detailed transactions.
            var oRole = oEvent.getSource().getBindingContext("review").getObject();
            this._oSelectedRole = oRole;
            if (!this._oUsageDialog) {
                this._oUsageDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "rnow.approval.corner.view.fragments.UsageAnalysisDialog",
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

        _loadUsageData: function(oRole) {
            // Fetch the transaction usage data for the chosen role and prepare the dialog table.
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
                    var oTable = this.byId("usageTable");
                    if (!this._bUsageHighlightBound) {
                        this._bUsageHighlightBound = true;
                        oTable.attachEvent("rowsUpdated", this._highlightCriticalRows, this);
                        oTable.attachEvent("firstVisibleRowChanged", this._highlightCriticalRows, this);
                    }
                    this._highlightCriticalRows();
                }.bind(this),
                error: function(oError) {
                    this._oUsageDialog.setBusy(false);
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgLoadError", ["usage analysis"]));
                }.bind(this)
            });
        },

        _highlightCriticalRows: function() {
            // Highlight usage rows marked as critical so they stand out visually.
            var oTable = this.byId("usageTable");
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

        onUsageActionChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("usage");
            this._validateUsageCommentForRow(oContext.getModel(), oContext.getPath());
        },

        onUsageCommentChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("usage");
            this._validateUsageCommentForRow(oContext.getModel(), oContext.getPath());
        },

        _validateUsageCommentForRow: function(oModel, sPath) {
            // Require a comment for usage rows when the lock action is selected.
            var sAction = oModel.getProperty(sPath + "/Action") || "";
            var sComment = (oModel.getProperty(sPath + "/comments") || "").trim();
            // Comment mandatory only for Lock action
            var bError = (sAction === "Lock") && !sComment;
            oModel.setProperty(
                sPath + "/CommentState",
                bError ? "Error" : "None"
            );
            return !bError;
        },

        onUsageDialogClose: function() {
            this._oUsageDialog.close();
        },

        onUsageCompleteSave: function() {
            // Validate and submit the usage-analysis changes for the selected role.
            var oUsageModel = this._getUsageModel();
            var aItems = oUsageModel.getProperty("/Items") || [];
            var bChanged = false;
            for (var i = 0; i < aItems.length; i++) {
                var oItem = aItems[i];
                if (oItem.Action !== oItem.OriginalAction) {
                    bChanged = true;
                    if (!this._validateUsageCommentForRow(oUsageModel, "/Items/" + i)) {
                        var oBundle = this.getView().getModel("i18n").getResourceBundle();
                        MessageToast.show(oBundle.getText("valCommentMandatoryLock"));
                        return;
                    }
                }
            }
            if (!bChanged) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(oBundle.getText("msgNoChangesSave"));
                return;
            }
            var oODataModel = this._getODataModel();
            if (!oODataModel) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageBox.error(oBundle.getText("errNoBackendConnection"));
                return;
            }
            var oRow = this._oUsageRow || {};
            var oCtxModel = this.getOwnerComponent().getModel("reviewContext");
            var oCtx = (oCtxModel && oCtxModel.getData()) || {};
            var sLoginUser = oCtx.loginUser || this._sUser || "";
            var aTcodeItems = aItems.map(function(o) {
                return {
                    LOGINUSER: sLoginUser,
                    CONNECTOR: this._sConnector || "",
                    JOB_ID: this._sJobId || "",
                    EUSER: this._sUser || "",
                    Rfcdest: o.Rfcdest || this._sConnector || "",
                    Bname: o.Bname || "",
                    JobId: this._sJobId || "",
                    AgrName: o.AgrName || "",
                    Tcode: o.Tcode || "",
                    AgrDesc: o.AgrDesc || "",
                    TcodeDesc: o.TcodeDesc || "",
                    LastTused: o.LastTused || "",
                    CriticalTcode: o.CriticalTcode || "",
                    LastUsedon: o.LastUsedon || "",
                    tccount: o.tccount || "",
                    comments: o.comments || "",
                    Action: o.Action || ""
                };
            }.bind(this));
            var oPayload = {
                LOGINUSER: sLoginUser,
                Connector: this._sConnector || "",
                JobId: this._sJobId || "",
                EUser: this._sUser || "",
                FullName: oRow.FullName || oRow.fullName || "",
                Role: oRow.Role || oRow.roleName || oRow.AgrName || "",
                RoleDesc: oRow.RoleDesc || oRow.roleDescription || "",
                LicCat: oRow.LicCat || oRow.licenseType || "",
                FromDate: oRow.FromDate || oRow.fromDate || "",
                ToDate: oRow.ToDate || oRow.toDate || "",
                UtilizationText: oRow.UtilizationText || oRow.tcodeCount || "",
                COMMENT: "",
                Action: "",
                TCODEITEMNAV: aTcodeItems
            };
            this._oUsageDialog.setBusy(true);
            oODataModel.create("/Review_screenSet", oPayload, {
                success: function() {
                    this._oUsageDialog.setBusy(false);
                    aItems.forEach(function(oItem) {
                        oItem.OriginalAction = oItem.Action;
                        oItem.OriginalComment = oItem.comments;
                    });
                    oUsageModel.refresh(true);
                    this._oUsageDialog.close();
                    var sRole = oRow.Role || oRow.roleName || oRow.AgrName || "";
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgReviewCompletedRole", [sRole]));
                }.bind(this),
                error: function(oError) {
                    this._oUsageDialog.setBusy(false);
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageBox.error(this._getErrorMessage(oError, oBundle.getText("errSaveFailed")));
                }.bind(this)
            });
        },

         onExit: function() {
            try {
                this.getOwnerComponent().getRouter().getRoute("ReviewView").detachPatternMatched(this._onRouteMatched, this);
            } catch (e) {}
            if (this._oUsageDialog) {
                this._oUsageDialog.destroy();
                this._oUsageDialog = null;
            }
            if (this._oSubmitDialog) {
                this._oSubmitDialog.destroy();
                this._oSubmitDialog = null;
                this._oSubmitTextArea = null;
            }
        }

    });
});