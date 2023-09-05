import { i18n } from "../../js/localization.js";
import GUI from "../../js/gui.js";
import semver from "semver";
import EscDshotDirectionMotorDriver from "./EscDshotDirectionMotorDriver.js";
import DshotCommand from "../../js/utils/DshotCommand.js";
import FC from "../../js/fc.js";
import { API_VERSION_1_44 } from '../../js/data_storage.js';
import { getMixerImageSrc } from "../../js/utils/common.js";
import $ from "jquery";

class EscDshotDirectionComponent
{
    constructor(contentDiv, onLoadedCallback, motorConfig)
    {
        this._buttonTimeoutMs = 400;
        const motorDriverQueueIntervalMs = 100;
        const motorDriverStopMotorsPauseMs = 400;

        this._motorDriver = new EscDshotDirectionMotorDriver(motorConfig,
            motorDriverQueueIntervalMs, motorDriverStopMotorsPauseMs);
        this._escProtocolIsDshot = motorConfig.escProtocolIsDshot;
        this._numberOfMotors = motorConfig.numberOfMotors;
        this._contentDiv = contentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._currentSpinningMotor = -1;
        this._selectedMotor = -1;
        this._motorIsSpinning = false;
        this._allMotorsAreSpinning = false;
        this._spinDirectionToggleIsActive = true;
        this._activationButtonTimeoutId = null;

        this._contentDiv.load("./components/EscDshotDirection/Body.html", () =>
        {
            this._initializeDialog();
        });
    }

    static get PUSHED_BUTTON_CLASS() { return "pushed"; }
    static get HIGHLIGHTED_BUTTON_CLASS() { return "highlighted"; }
    static get RED_TEXT_CLASS() { return "red-text"; }

    static get _BUTTON_PUSH_DOWN_EVENT_TYPE()
    {
        if (GUI.isCordova()) {
            return "touchstart";
        } else {
            return "mousedown";
        }
    }

    static get _BUTTON_RELEASE_EVENT_TYPE()
    {
        if (GUI.isCordova()) {
            return "touchend";
        } else {
            return "mouseup mouseout";
        }
    }

    _readDom()
    {
        this._domAgreeSafetyCheckBox = $("#escDshotDirectionDialog-safetyCheckbox");
        this._domStartButton = $("#escDshotDirectionDialog-Start");
        this._domStartWizardButton = $("#escDshotDirectionDialog-StartWizard");
        this._domMainContentBlock = $("#escDshotDirectionDialog-MainContent");
        this._domWarningContentBlock = $("#escDshotDirectionDialog-Warning");
        this._domMixerImg = $("#escDshotDirectionDialog-MixerPreviewImg");
        this._domMotorButtonsBlock = $("#escDshotDirectionDialog-SelectMotorButtonsWrapper");
        this._domSpinDirectionWrapper = $("#escDshotDirectionDialog-CommandsWrapper");
        this._domActionHint = $("#escDshotDirectionDialog-ActionHint");
        this._domSpinNormalButton = $("#escDshotDirectionDialog-RotationNormal");
        this._domSpinReverseButton = $("#escDshotDirectionDialog-RotationReverse");
        this._domSecondHint = $("#escDshotDirectionDialog-SecondHint");
        this._domSecondActionDiv = $("#escDshotDirectionDialog-SecondActionBlock");
        this._domConfigErrors = $("#escDshotDirectionDialog-ConfigErrors");
        this._domWrongProtocolMessage = $("#escDshotDirectionDialog-WrongProtocol");
        this._domWrongMixerMessage = $("#escDshotDirectionDialog-WrongMixer");
        this._domWrongFirmwareMessage = $("#escDshotDirectionDialog-WrongFirmware");
        this._domWizardBlock = $("#escDshotDirectionDialog-WizardDialog");
        this._domNormalDialogBlock = $("#escDshotDirectionDialog-NormalDialog");
        this._domSpinningWizard = $("#escDshotDirectionDialog-SpinningWizard");
        this._domSpinWizardButton = $("#escDshotDirectionDialog-SpinWizard");
        this._domStopWizardButton = $("#escDshotDirectionDialog-StopWizard");
        this._domWizardMotorButtonsBlock = $("#escDshotDirectionDialog-WizardMotorButtons");
        this._domStartWizardBlock = $("#escDshotDirectionDialog-StartWizardBlock");
        this._domStartNormalBlock = $("#escDshotDirectionDialog-StartNormalBlock");

        this._topHintText = i18n.getMessage("escDshotDirectionDialog-SelectMotor");
        this._releaseToStopText = i18n.getMessage("escDshotDirectionDialog-ReleaseToStop");
        this._releaseButtonToStopText = i18n.getMessage("escDshotDirectionDialog-ReleaseButtonToStop");
        this._normalText = i18n.getMessage("escDshotDirectionDialog-CommandNormal");
        this._reverseText = i18n.getMessage("escDshotDirectionDialog-CommandReverse");
        this._secondHintText = i18n.getMessage("escDshotDirectionDialog-SetDirectionHint");
    }

    _initializeDialog()
    {
        this._readDom();
        this._createMotorButtons();
        this._createWizardMotorButtons();
        this._domSecondActionDiv.toggle(false);
        i18n.localizePage();

        this._resetGui();

        this._domAgreeSafetyCheckBox.on("change", () => {
            const enabled = this._domAgreeSafetyCheckBox.is(':checked');
            this._domStartNormalBlock.toggle(enabled);
            this._domStartWizardBlock.toggle(enabled);
        });

        this._domStartButton.on("click", () => {
            this._onStartButtonClicked();
        });

        this._domStartWizardButton.on("click", () => {
            this._onStartWizardButtonClicked();
        });

        this._domSpinWizardButton.on("click", () => {
            this._onSpinWizardButtonClicked();
        });

        this._domStopWizardButton.on("click", () => {
            this._onStopWizardButtonClicked();
        });

        const imgSrc = getMixerImageSrc(FC.MIXER_CONFIG.mixer, FC.MIXER_CONFIG.reverseMotorDir, FC.CONFIG.apiVersion);
        this._domMixerImg.attr('src', imgSrc);

        this._onLoadedCallback();
    }

    _activateNormalReverseButtons(timeoutMs)
    {
        this._activationButtonTimeoutId = setTimeout(() => {
            this._subscribeDirectionSpinButton(this._domSpinNormalButton,
                DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1, this._normalText);
            this._subscribeDirectionSpinButton(this._domSpinReverseButton,
                DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2, this._reverseText);
        }, timeoutMs);
    }

    _deactivateNormalReverseButtons()
    {
        if (null !== this._activationButtonTimeoutId) {
            clearTimeout(this._activationButtonTimeoutId);
        }

        this._domSpinNormalButton.off();
        this._domSpinReverseButton.off();
    }

    _subscribeDirectionSpinButton(button, direction, buttonText)
    {
        button.on(EscDshotDirectionComponent._BUTTON_PUSH_DOWN_EVENT_TYPE, () => {
            this._sendCurrentEscSpinDirection(direction);
            this._motorIsSpinning = true;
            button.text(this._releaseToStopText);
            button.addClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
            this._motorDriver.spinMotor(this._selectedMotor);
            this._domSecondHint.html(this._releaseButtonToStopText);
            this._domSecondHint.addClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
        });

        button.on(EscDshotDirectionComponent._BUTTON_RELEASE_EVENT_TYPE, () => {
            if (this._motorIsSpinning) {
                button.text(buttonText);
                this._motorIsSpinning = false;
                button.removeClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
                this._motorDriver.stopAllMotors();
                this._domSecondHint.text(this._secondHintText);
                this._domSecondHint.removeClass(EscDshotDirectionComponent.RED_TEXT_CLASS);

                this._deactivateNormalReverseButtons();
                this._activateNormalReverseButtons(this._buttonTimeoutMs);
            }
        });
    }

    _sendCurrentEscSpinDirection(direction)
    {
        this._motorDriver.setEscSpinDirection(this._selectedMotor, direction);
    }

    _createMotorButtons()
    {
        this._motorButtons = {};

        for (let i = 0; i < this._numberOfMotors; i++) {
            this._addMotorButton(i + 1, i);
        }

        this._addMotorButton("All", DshotCommand.ALL_MOTORS);
    }

    _addMotorButton(buttonText, motorIndex)
    {
        const button = $(`<a href="#" class="regular-button ${EscDshotDirectionComponent.PUSHED_BUTTON_CLASS}"></a>`).text(buttonText);
        this._domMotorButtonsBlock.append(button);
        this._motorButtons[motorIndex] = button;

        button.on(EscDshotDirectionComponent._BUTTON_PUSH_DOWN_EVENT_TYPE, () => {
            this._domSecondActionDiv.toggle(true);
            this._motorIsSpinning = true;
            this._domActionHint.html(this._releaseButtonToStopText);
            this._domActionHint.addClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
            this._changeSelectedMotor(motorIndex);
            button.addClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
            this._motorDriver.spinMotor(this._selectedMotor);
        });

        button.on(EscDshotDirectionComponent._BUTTON_RELEASE_EVENT_TYPE, () => {
            if (this._motorIsSpinning) {
                this._domActionHint.html(this._topHintText);
                this._domActionHint.removeClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
                this._motorIsSpinning = false;
                button.removeClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
                this._motorDriver.stopAllMotors();

                this._deactivateNormalReverseButtons();
                this._activateNormalReverseButtons(this._buttonTimeoutMs);
            }
        });
    }

    _createWizardMotorButtons()
    {
        this._wizardMotorButtons = {};

        for (let i = 0; i < this._numberOfMotors; i++) {
            this._addWizardMotorButton(i + 1, i);
        }
    }

    _activateWizardMotorButtons(timeoutMs)
    {
        this._activationButtonTimeoutId = setTimeout(() => {
            for (let i = 0; i < this._numberOfMotors; i++) {
                this._activateWizardMotorButton(i);
            }
        }, timeoutMs);
    }

    _deactivateWizardMotorButtons()
    {
        if (null !== this._activationButtonTimeoutId)
        {
            clearTimeout(this._activationButtonTimeoutId);
        }

        for (let i = 0; i < this._numberOfMotors; i++) {
            const button =  this._wizardMotorButtons[i];
            button.off();
        }
    }

    _addWizardMotorButton(buttonText, motorIndex)
    {
        const button = $(`<a href="#" class="regular-button"></a>`).text(buttonText);
        this._domWizardMotorButtonsBlock.append(button);
        this._wizardMotorButtons[motorIndex] = button;
    }

    _activateWizardMotorButton(motorIndex)
    {
        const button =  this._wizardMotorButtons[motorIndex];

        button.on("click", () => {
            this._wizardMotorButtonClick(button, motorIndex);
        });
    }

    _wizardMotorButtonClick(button, motorIndex)
    {
        this._deactivateWizardMotorButtons();
        const currentlyDown = button.hasClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);

        if (currentlyDown) {
            button.removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1);
        } else {
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2);
            button.addClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._activateWizardMotorButtons(this._buttonTimeoutMs);
    }

    _changeSelectedMotor(newIndex)
    {
        if (this._selectedMotor >= 0) {
            this._motorButtons[this._selectedMotor].addClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._selectedMotor = newIndex;

        if (this._selectedMotor > -1) {
            this._motorButtons[this._selectedMotor].removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }
    }

    close()
    {
        this._motorDriver.stopAllMotorsNow();
        this._motorDriver.deactivate();
        this._resetGui();
    }

    _resetGui()
    {
        this._toggleMainContent(false);
        this._domStartNormalBlock.hide();
        this._domStartWizardBlock.hide();

        this._domAgreeSafetyCheckBox.prop('checked', false);
        this._domAgreeSafetyCheckBox.trigger('change');
        this._domSecondActionDiv.toggle(false);
        this._changeSelectedMotor(-1);

        this._checkForConfigurationErrors();
    }

    _checkForConfigurationErrors()
    {
        let anyError = false;

        this._domWrongProtocolMessage.hide();
        this._domWrongMixerMessage.hide();
        this._domWrongFirmwareMessage.hide();

        if (!this._escProtocolIsDshot) {
            anyError = true;
            this._domWrongProtocolMessage.show();
        }

        if (this._numberOfMotors <= 0) {
            anyError = true;
            this._domWrongMixerMessage.show();
        }

        if (!semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            // if BF4.2 or older - show the error message
            anyError = true;
            this._domWrongFirmwareMessage.show();
        }

        if (anyError) {
            this._domMainContentBlock.hide();
            this._domWarningContentBlock.hide();
            this._domStartNormalBlock.hide();
            this._domStartWizardBlock.hide();
            this._domConfigErrors.show();
        } else {
            this._domConfigErrors.hide();
        }
    }


    _onStartButtonClicked()
    {
        this._toggleMainContent(true);
        this._domWizardBlock.toggle(false);
        this._domNormalDialogBlock.toggle(true);
        this._motorDriver.activate();
    }

    _onStartWizardButtonClicked()
    {
        this._domSpinningWizard.toggle(false);
        this._domSpinWizardButton.toggle(true);
        this._toggleMainContent(true);
        this._domWizardBlock.toggle(true);
        this._domNormalDialogBlock.toggle(false);
        this._motorDriver.activate();
    }

    _onSpinWizardButtonClicked()
    {
        for (let i = 0; i < this._numberOfMotors; i++) {
            this._wizardMotorButtons[i].removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._motorDriver.setEscSpinDirection(DshotCommand.ALL_MOTORS, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1);

        this._domSpinWizardButton.toggle(false);
        this._domSpinningWizard.toggle(true);
        this._motorDriver.spinAllMotors();

        this._activateWizardMotorButtons(0);
    }

    _onStopWizardButtonClicked()
    {
        this._domSpinWizardButton.toggle(true);
        this._domSpinningWizard.toggle(false);
        this._motorDriver.stopAllMotorsNow();
        this._deactivateWizardMotorButtons();
    }

    _toggleMainContent(value)
    {
        this._domWarningContentBlock.toggle(!value);
        this._domMainContentBlock.toggle(value);
        this._domConfigErrors.toggle(false);
    }

}

export default EscDshotDirectionComponent;
