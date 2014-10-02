BlockSpam.js
============

NodeJS spam filter system.

Technique
=========

The current version implements a baysian filtering system. Future
plans include:


* interactive learning by monitoring mail folders.
* automatic whitelists


Usage
=====

Procmail
--------

In .procmailrc

~~~
:0fw
| node blockspam.js -d ~/.spamdb.json

:0
* ^X-Spamblock-Score: \*\*\*\*\*\*\*
.maildir/.spam

:0
* ^X-Spamblock-Score: \*\*\*\*\*
.maildir/.maybe-spam


~~~
