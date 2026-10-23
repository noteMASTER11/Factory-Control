// A running client keeps mod-list in memory and overwrites disk edits on exit.
// Installation must stop before staging or altering the profile in that case.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const pwsh='D:/ChatGPT/Tools/PowerShell/pwsh.exe',game='D:/SteamLibrary/steamapps/common/Factorio/bin/x64/Factorio.exe';
const running=spawnSync(pwsh,['-NoProfile','-Command',`@(Get-Process factorio -ErrorAction SilentlyContinue).Count`],{encoding:'utf8'});
if(!Number(running.stdout.trim())){console.log('SKIP: requires a running Factorio client');process.exit(0);}
const root=fs.mkdtempSync('D:/ChatGPT/Temp/FactorioMonitor/installer-guard-'),profile=path.join(root,'profile');
fs.mkdirSync(path.join(profile,'mods'),{recursive:true});
const list=path.join(profile,'mods/mod-list.json'),original='{"mods":[]}';fs.writeFileSync(list,original);
for(const [script,extra]of [
 ['install-live-collector.ps1',['-SkipDesktopStart']],
 ['install-release.ps1',['-PackageDirectory',root,'-InstallDirectory',path.join(root,'install')]]
]){
 const result=spawnSync(pwsh,['-NoProfile','-File',path.resolve('scripts',script),'-GameExecutable',game,'-GameProfile',profile,...extra],{encoding:'utf8',env:{...process.env,TEMP:'D:/ChatGPT/Temp/FactorioMonitor',TMP:'D:/ChatGPT/Temp/FactorioMonitor'}});
 assert.notEqual(result.status,0,script+' must reject a running game');
 assert.match(result.stdout+result.stderr,/Close Factorio before installing/i,script+' should explain the required action');
 assert.equal(fs.readFileSync(list,'utf8'),original,'must not rewrite the running game configuration');
}
console.log('Both installers reject an active client before modifying its profile.');
