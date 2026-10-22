# Factory Telemetry Bridge 0.4.0

Коллектор для Factorio 2.0.77+. Пишет готовые JSON в `script-output/factory-telemetry/`: status, production, machines, power, logistics, research, resources, combat. Не добавляет прототипов и не меняет игровые механики.

Индексация разведанной территории и измерения выполняются порциями: до 16 объектов за тик; большие запросы сундуков — страницами по 16 записей за тик. Снимки содержат тик, сессию, охват и возраст замеров. Логируются ошибки и среднее время работы коллектора.

Команда: `/factory-telemetry-status`. Remote: `remote.call("factory_telemetry", "snapshot", "power")` — последний готовый JSON либо nil, без нового сканирования. В multiplayer экспорт находится на сервере.

Установка: поместить ZIP в mods, включить Factory Telemetry Bridge, перезапустить игру и загрузить карту. Для настольного терминала использовать Install-FactoryControl.ps1 из релиза. Обновление уже установленного Lua-кода требует повторной загрузки карты.

Полное описание каналов, установки и ограничений: https://github.com/noteMASTER11/Factory-Control
