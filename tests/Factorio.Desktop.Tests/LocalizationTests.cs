using Factorio.Desktop;
using Xunit;

namespace Factorio.Desktop.Tests;

public sealed class LocalizationTests
{
    [Theory]
    [InlineData("uk", "uk-UA")]
    [InlineData("de-AT", "de-DE")]
    [InlineData("pt_BR", "pt-PT")]
    [InlineData("es-MX", "es-ES")]
    [InlineData(null, "en-US")]
    [InlineData("xx-XX", "en-US")]
    public void WindowsLanguageResolvesToShippedLocale(string? code, string expected)
        => Assert.Equal(expected, Localization.Resolve(code));

    [Theory]
    [InlineData("ru-RU")][InlineData("uk-UA")][InlineData("en-US")]
    [InlineData("de-DE")][InlineData("es-ES")][InlineData("fr-FR")]
    [InlineData("cs-CZ")][InlineData("hu-HU")][InlineData("et-EE")]
    [InlineData("fi-FI")][InlineData("pt-PT")]
    public void EmbeddedLocaleContainsNativeError(string locale)
    {
        Assert.True(Localization.Select(locale));
        Assert.Contains("{detail}",Localization.Text("native.initError"));
    }
}
