import GUI from "gui";
import { i18n } from "localization";
import $ from 'jquery';

$(document).ready(function () {
    // Create button dynamically
    let button = $("<button>").text("Open Popup").click(function () {
      openPopup();
    });

    // Append the button to the body
    $("body").append(button);
  });

  function openPopup() {
    // Create popup content dynamically
    let popupContent = $("<div>").html("<h2>Popup Content</h2><p>This is your custom popup content.</p>");

    // Append the popup content to the body
    $("body").append(popupContent);

    let popup = $(".popup-container");
    let overlay = $(".overlay");

    popup.show();
    overlay.show();

    // Close the popup when clicking outside the content
    overlay.click(function () {
      closePopup();
    });
  }

  function closePopup() {
    $(".popup-container").remove();
    $(".overlay").hide();
  }
