import { stripGeneratedImports } from '../src/previewTransform.js';
import babel from '@babel/core';

const code = 'import React, { useState } from "react";\nexport default function GeneratedComponent(){ return (<form><input /><button type="submit">SEND</button>{submitted && (<p role="status">Message sent locally.</p>)}</form>); }';
const stripped = stripGeneratedImports(code);
if (/^\s*import\b/m.test(stripped) || /export\s+default/.test(stripped)) throw new Error('preview import stripping differs from runtime expectation');
babel.transformSync(stripped, { ast: true, code: false, parserOpts: { plugins: ['jsx'] } });
console.log('PASS exact LivePreview import-strip parser boundary');
