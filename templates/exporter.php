<?php
/**
 * wpbox temporary database exporter.
 *
 * Uploaded by `wpbox init` over FTP/SFTP, called once over HTTP(S) with a random one-time
 * token, and deleted right after (it also deletes itself when done). It streams a SQL dump
 * of the WordPress tables (only the ones using this site's table prefix).
 */
$token = '__WPBOX_TOKEN__';
if (!isset($_GET['token']) || !is_string($_GET['token']) || !hash_equals($token, $_GET['token'])) {
    http_response_code(404);
    exit;
}

@set_time_limit(0);
@ini_set('memory_limit', '512M');
while (ob_get_level()) {
    ob_end_clean();
}

define('SHORTINIT', true);
if (!file_exists(__DIR__ . '/wp-load.php')) {
    http_response_code(500);
    exit('wpbox: wp-load.php not found next to the exporter');
}
require __DIR__ . '/wp-load.php';
global $table_prefix;

$host = DB_HOST;
$port = null;
$socket = null;
if (preg_match('/^(.*):(\d+)$/', $host, $m)) {
    $host = $m[1];
    $port = (int) $m[2];
} elseif (preg_match('/^(.*):(\/.*)$/', $host, $m)) {
    $host = $m[1];
    $socket = $m[2];
}
if ($host === '') {
    $host = 'localhost';
}

mysqli_report(MYSQLI_REPORT_OFF);
$db = mysqli_init();
if (!$db || !@$db->real_connect($host, DB_USER, DB_PASSWORD, DB_NAME, $port, $socket)) {
    http_response_code(500);
    exit('wpbox: could not connect to the database');
}
$db->set_charset('utf8mb4');

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Accel-Buffering: no');

$q = function ($name) {
    return '`' . str_replace('`', '``', $name) . '`';
};

echo "-- wpbox export\n";
echo "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n";

$tables = array();
$res = $db->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
while ($row = $res->fetch_row()) {
    if (strpos($row[0], $table_prefix) === 0) {
        $tables[] = $row[0];
    }
}
$res->free();

$binaryTypes = array(
    MYSQLI_TYPE_TINY_BLOB, MYSQLI_TYPE_MEDIUM_BLOB, MYSQLI_TYPE_LONG_BLOB, MYSQLI_TYPE_BLOB,
    MYSQLI_TYPE_STRING, MYSQLI_TYPE_VAR_STRING,
);
$numericTypes = array(
    MYSQLI_TYPE_TINY, MYSQLI_TYPE_SHORT, MYSQLI_TYPE_LONG, MYSQLI_TYPE_LONGLONG, MYSQLI_TYPE_INT24,
    MYSQLI_TYPE_DECIMAL, MYSQLI_TYPE_NEWDECIMAL, MYSQLI_TYPE_FLOAT, MYSQLI_TYPE_DOUBLE, MYSQLI_TYPE_YEAR,
);

foreach ($tables as $table) {
    $create = $db->query('SHOW CREATE TABLE ' . $q($table))->fetch_row();
    echo 'DROP TABLE IF EXISTS ' . $q($table) . ";\n" . $create[1] . ";\n\n";

    $result = $db->query('SELECT * FROM ' . $q($table), MYSQLI_USE_RESULT);
    if (!$result) {
        continue;
    }
    $binary = array();
    $numeric = array();
    foreach ($result->fetch_fields() as $i => $field) {
        $binary[$i] = $field->charsetnr === 63 && in_array($field->type, $binaryTypes, true);
        $numeric[$i] = in_array($field->type, $numericTypes, true);
    }

    $rows = array();
    $size = 0;
    while ($row = $result->fetch_row()) {
        $values = array();
        foreach ($row as $i => $value) {
            if ($value === null) {
                $values[] = 'NULL';
            } elseif ($numeric[$i] && is_numeric($value)) {
                $values[] = $value;
            } elseif ($binary[$i]) {
                $values[] = $value === '' ? "''" : '0x' . bin2hex($value);
            } else {
                $values[] = "'" . $db->real_escape_string($value) . "'";
            }
        }
        $line = '(' . implode(',', $values) . ')';
        $rows[] = $line;
        $size += strlen($line);
        if ($size > 1000000 || count($rows) >= 500) {
            echo 'INSERT INTO ' . $q($table) . " VALUES\n" . implode(",\n", $rows) . ";\n";
            flush();
            $rows = array();
            $size = 0;
        }
    }
    if ($rows) {
        echo 'INSERT INTO ' . $q($table) . " VALUES\n" . implode(",\n", $rows) . ";\n";
    }
    $result->free();
    echo "\n";
    flush();
}

echo "SET FOREIGN_KEY_CHECKS=1;\n-- wpbox export complete\n";
@unlink(__FILE__);
