<?php
/**
 * Plugin Name: wpbox – Mailpit
 * Description: Local environment only. Every email sent by WordPress is caught by Mailpit,
 *              so nothing ever reaches real inboxes. Added by wpbox.
 */
add_action('phpmailer_init', function ($phpmailer) {
    $phpmailer->isSMTP();
    $phpmailer->Host = 'mailpit';
    $phpmailer->Port = 1025;
    $phpmailer->SMTPAuth = false;
    $phpmailer->SMTPSecure = '';
    $phpmailer->SMTPAutoTLS = false;
}, PHP_INT_MAX);

add_filter('wp_mail_from', function () { return 'wordpress@local.test'; });
add_filter('wp_mail_from_name', function () { return 'WordPress (local)'; });
