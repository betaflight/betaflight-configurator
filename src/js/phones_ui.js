import GUI from "./gui";
import $ from 'jquery';

const UI_PHONES = {
    background: '#background',
    tabContainer: '.tab_container',
    tabContentContainer: '#tab-content-container',
    headerbar: '.headerbar',
    init: function() {
        const self = this;
        $('#menu_btn').click(function() {
            self.openSideMenu();
        });
        $(this.background).click(function() {
            self.closeSideMenu();
        });
        $('#tabs a').click(function() {
            if ($('.tab_container').hasClass('reveal')) {
                self.closeSideMenu();
            }
        });
        $('#reveal_btn').click(function() {
            self.expandHeader();
        });
        $(`${this.background}, ${this.tabContainer}`).swipe( {
            swipeLeft: function() {
                self.closeSideMenu();
            },
        });
        $('#side_menu_swipe').swipe( {
            swipeRight: function() {
                self.openSideMenu();
            },
        });
    },
    initToolbar: function() {
        $('.toolbar_expand_btn').click(this.expandToolbar);
    },
    openSideMenu: function() {
        $(this.background).fadeIn(300);
        $(this.tabContainer).addClass('reveal');
    },
    closeSideMenu: function() {
        $(this.background).fadeOut(300);
        $(this.tabContainer).removeClass('reveal');
    },
    expandHeader: function() {
        const self = this;
        let expand, headerExpanded, reveal;
        if (GUI.connected_to) {
            expand = 'expand2';
            headerExpanded = 'header_expanded2';
            reveal = '.header-wrapper';
        } else {
            expand = 'expand';
            headerExpanded = 'headerExpanded';
            reveal = '#port-picker';
        }
        if ($(self.headerbar).hasClass(expand)) {
            $(reveal).removeClass('reveal');
            setTimeout(function() {
                $(self.tabContentContainer).removeClass(headerExpanded);
                $(self.headerbar).removeClass(expand);
            }, 100);
        } else {
            $(self.tabContentContainer).addClass(headerExpanded);
            $(self.headerbar).addClass(expand);
            setTimeout(function() {
                $(reveal).addClass('reveal');
            }, 100);
        }
    },
    expandToolbar: function() {
        const toolbar = $('.content_toolbar.xs-compressed');
        if (toolbar.length > 0) {
            if ($('.content_toolbar.xs-compressed').hasClass('expanded')) {
                toolbar.removeClass('expanded');
            } else {
                toolbar.addClass('expanded');
            }
        }
    },
    reset: function() {
        $(this.tabContentContainer).removeClass('header_expanded2 header_expanded');
        $('#port-picker, .header-wrapper').removeClass('reveal');
        $(this.headerbar).removeClass('expand2 expand');
    },
};

export default UI_PHONES;
