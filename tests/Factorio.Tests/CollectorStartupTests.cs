using System.Globalization;
using Factorio.Core;
using Xunit;

public sealed class CollectorStartupTests
{
    private static readonly DateTimeOffset Started = new(2026, 10, 23, 8, 35, 12, TimeSpan.Zero);
    private static string Log(string body, DateTimeOffset? start = null) =>
        "   0.000 " + (start ?? Started).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
        "; Factorio 2.1.23\n" + body;
    private const string Enabled = "{\"mods\":[{\"name\":\"factory-telemetry\",\"enabled\":true}]}";
    private const string Disabled = "{\"mods\":[{\"name\":\"factory-telemetry\",\"enabled\":false}]}";

    [Fact]
    public void EnabledOnDiskIsNotProofOfLoadedCollector() => Assert.Equal("restart_required",
        CollectorStartupProbe.Evaluate(Enabled, Log("Checksum of base: 1\nFactorio initialised\nLoading map save.zip"), Started));

    [Fact]
    public void DisabledModExplainsWhyNoTelemetryArrives() => Assert.Equal("disabled",
        CollectorStartupProbe.Evaluate(Disabled, Log("Factorio initialised"), Started));

    [Fact]
    public void AbsentModEntryIsReportedSeparately() => Assert.Equal("not_installed",
        CollectorStartupProbe.Evaluate("{\"mods\":[]}", Log("Factorio initialised"), Started));

    [Fact]
    public void LogFromPreviousProcessCannotDiagnoseCurrentProcess() => Assert.Equal("unknown",
        CollectorStartupProbe.Evaluate(Enabled, Log("Factorio initialised", Started.AddHours(-1)), Started));

    [Fact]
    public void IncompleteStartupIsNotMistakenForMissingMod() => Assert.Equal("starting",
        CollectorStartupProbe.Evaluate(Enabled, Log("Loading mod base"), Started));

    [Theory]
    [InlineData("Checksum of factory-telemetry: 0\nFactorio initialised", "awaiting_map")]
    [InlineData("Checksum of factory-telemetry: 0\nFactorio initialised\nChecksum for script __factory-telemetry__/control.lua: 123", "awaiting_export")]
    public void LoadedRuntimeTakesPrecedenceOverNextStartupConfiguration(string body, string expected) =>
        Assert.Equal(expected, CollectorStartupProbe.Evaluate(Disabled, Log(body), Started));

    [Fact]
    public void UnreadableConfigurationDoesNotInventInstallationState() => Assert.Equal("unknown",
        CollectorStartupProbe.Evaluate("invalid-json", Log("Factorio initialised"), Started));
}
