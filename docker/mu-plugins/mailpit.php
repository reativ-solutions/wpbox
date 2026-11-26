<?php
/**
 * Plugin Name: wpdev – Mailpit
 * Description: Local environment only. Every email sent by WordPress is caught by Mailpit
 *              (http://localhost:8025), so nothing ever reaches real inboxes.
 */
add_action('phpmailer_init', function ($phpmailer) {
    $phpmailer->isSMTP();
    $phpmailer->Host = 'mailpit';
    $phpmailer->Port = 1025;
    $phpmailer->SMTPAuth = false;
    $phpmailer->SMTPSecure = '';
    $phpmailer->SMTPAutoTLS = false;
});

add_filter('wp_mail_from', fn() => 'wordpress@local.test');
add_filter('wp_mail_from_name', fn() => 'WordPress (local)');
