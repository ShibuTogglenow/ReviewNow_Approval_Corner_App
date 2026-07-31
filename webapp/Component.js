/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/Device",
         "sap/ui/model/json/JSONModel",
        "rnow/approval/corner/model/models"
    ],
    function (UIComponent, Device, JSONModel, models) {
        "use strict";
        var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 175" font-family="Arial, sans-serif">' +
        '<text x="0" y="108" font-size="72" font-weight="900" fill="#2b2b2b" letter-spacing="-1">REVIEW</text>' +
        '<g transform="translate(338,12)">' +
        '<path d="M46 2 C65 17 95 20 95 20 C95 74 66 104 46 116 C26 104 -3 74 -3 20 C-3 20 27 17 46 2 Z" fill="#ef5a28"/>' +
        '<path d="M20 56 l18 20 l56 -64" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</g>' +
        '<text x="448" y="108" font-size="72" font-weight="900" fill="#1ba1d6" letter-spacing="-1">NOW</text>' +
        '<text x="3" y="150" font-size="16.5" font-weight="600" fill="#000000" letter-spacing="5">STREAMLINED USER AUTHORIZATION REVIEWS</text>' +
        '</svg>';
        return UIComponent.extend("rnow.approval.corner.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);
                this.setModel(new JSONModel({
                    logo: "data:image/svg+xml," + encodeURIComponent(LOGO_SVG)
                }), "appUser");
                // enable routing
                this.getRouter().initialize();

                // set the device model
                this.setModel(models.createDeviceModel(), "device");
            }
        });
    }
);