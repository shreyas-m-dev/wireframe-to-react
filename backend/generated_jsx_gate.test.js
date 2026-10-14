'use strict';
const { validateGeneratedJsx } = require('./server');
const valid = 'import React from "react"; export default function GeneratedComponent(){ return (<form><input /><button type="submit">SEND</button>{true && (<p role="status">Message sent locally.</p>)}</form>); }';
const invalid = 'export default function GeneratedComponent(){ return (<form><input />{submitted && <p>Message</p>}</form><div />); }';
if (!validateGeneratedJsx(valid).valid) throw new Error('valid conditional form JSX was rejected');
if (validateGeneratedJsx(invalid).valid) throw new Error('adjacent JSX roots were accepted');
console.log('PASS generated JSX parser gate');
