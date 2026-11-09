<?php
/**
 * scrypt (RFC 7914) — pure PHP, for verifying password hashes created by the
 * Node server (crypto.scryptSync defaults: N=16384, r=8, p=1, 64-byte key).
 * PHP has no native scrypt, so this exists solely for legacy-account migration.
 * New passwords are always stored as password_hash() bcrypt.
 *
 * Verified against RFC 7914 §10 test vectors and Node crypto output.
 */

function _rotl32($x, $n) {
  $x &= 0xffffffff;
  return (($x << $n) | ($x >> (32 - $n))) & 0xffffffff;
}

function _salsa20_qr(array $x, $a, $b, $c, $d) {
  $x[$b] ^= _rotl32(($x[$a] + $x[$d]) & 0xffffffff, 7);
  $x[$c] ^= _rotl32(($x[$b] + $x[$a]) & 0xffffffff, 9);
  $x[$d] ^= _rotl32(($x[$c] + $x[$b]) & 0xffffffff, 13);
  $x[$a] ^= _rotl32(($x[$d] + $x[$c]) & 0xffffffff, 18);
  return $x;
}

/** Salsa20/8 core: 64-byte block → 64-byte block */
function _salsa20_8($B) {
  $x = [];
  $u = unpack('V16', $B);
  for ($i = 1; $i <= 16; $i++) $x[$i - 1] = $u[$i] & 0xffffffff;
  $orig = $x;
  for ($i = 0; $i < 4; $i++) {                 // 4 double rounds = Salsa20/8
    $x = _salsa20_qr($x, 0, 4, 8, 12);  $x = _salsa20_qr($x, 5, 9, 13, 1);
    $x = _salsa20_qr($x, 10, 14, 2, 6); $x = _salsa20_qr($x, 15, 3, 7, 11);
    $x = _salsa20_qr($x, 0, 1, 2, 3);   $x = _salsa20_qr($x, 5, 6, 7, 4);
    $x = _salsa20_qr($x, 10, 11, 8, 9); $x = _salsa20_qr($x, 15, 12, 13, 14);
  }
  for ($i = 0; $i < 16; $i++) $x[$i] = ($x[$i] + $orig[$i]) & 0xffffffff;
  return pack('V16', ...$x);
}

/** scryptBlockMix(B, r): input 128*r bytes → output 128*r bytes */
function _blockmix($B, $r) {
  $X = substr($B, (2 * $r - 1) * 64, 64);
  $Y = array_fill(0, 2 * $r, '');
  for ($i = 0; $i < 2 * $r; $i++) {
    $T = $X ^ substr($B, $i * 64, 64);
    $X = _salsa20_8($T);
    $Y[$i] = $X;
  }
  $out = '';
  for ($i = 0; $i < $r; $i++) $out .= $Y[2 * $i];
  for ($i = 0; $i < $r; $i++) $out .= $Y[2 * $i + 1];
  return $out;
}

/** scryptROMix(B, N, r) */
function _romix($B, $N, $r) {
  $X = $B;
  $V = [];
  for ($i = 0; $i < $N; $i++) { $V[$i] = $X; $X = _blockmix($X, $r); }
  for ($i = 0; $i < $N; $i++) {
    $u = unpack('V2', substr($X, -64, 8));   // Integerify = last 64-octet block, first 8 bytes little-endian
    $j = ($u[1] + ($u[2] % $N) * (4294967296 % $N)) % $N;
    $T = $X ^ $V[$j];
    $X = _blockmix($T, $r);
  }
  return $X;
}

/** RFC 7914 scrypt */
function scrypt_hash($password, $salt, $N, $r, $p, $dkLen) {
  $mfLen = 128 * $r;
  $B = hash_pbkdf2('sha256', $password, $salt, 1, $mfLen * $p, true);
  for ($i = 0; $i < $p; $i++) {
    $B = substr($B, 0, $i * $mfLen) . _romix(substr($B, $i * $mfLen, $mfLen), $N, $r) . substr($B, ($i + 1) * $mfLen);
  }
  return hash_pbkdf2('sha256', $password, $B, 1, $dkLen, true);
}

/** Verify against Node crypto.scryptSync(password, salt, 64) with N=16384, r=8, p=1.
    The Node server stores randomBytes(16).toString("hex") in password_salt and passes
    that 32-char string (as utf8 bytes) directly to scryptSync — keep that contract. */
function scrypt_verify_node($password, $saltHex, $expectedHex) {
  $expected = hex2bin($expectedHex);
  if ($expected === false || strlen($expected) !== 64) return false;
  $dk = scrypt_hash($password, (string) $saltHex, 16384, 8, 1, 64);
  return hash_equals($expected, $dk);
}
